import { DiagramRenderer } from "../diagrams/diagrams";
import { highlightCodeBlocks } from "../markdown/code";
import { renderMathPlaceholders } from "../markdown/math";
import { MarkdownPipeline } from "../markdown/pipeline";
import { applyResourcePolicy } from "../security/resource-policy";
import type { ViewerAdapter, ViewerContext, ViewerResult } from "./types";

export class MarkdownViewer implements ViewerAdapter {
  public readonly id = "markdown" as const;
  private readonly pipeline = new MarkdownPipeline();

  public constructor(private readonly diagrams: DiagramRenderer) {}

  public canRender(context: ViewerContext): boolean {
    return context.update.source.kind === "text" &&
      (context.update.formatHint === "markdown" || context.update.settings.formatOverride === "markdown");
  }

  public async render(context: ViewerContext): Promise<ViewerResult> {
    const result = await this.pipeline.render(context.update);
    if (!context.isCurrent()) return {};

    revokeObjectUrls(context.root);
    context.root.innerHTML = result.html;
    applyResourcePolicy(context.root, {
      documentDirectoryToken: context.directoryToken,
      remoteImages: context.update.settings.remoteImages
    });

    const warnings: string[] = [];
    await Promise.all([
      result.math.length > 0
        ? renderMathPlaceholders(context.root, result.math, context.isCurrent).catch((error: unknown) => {
            warnings.push(error instanceof Error ? error.message : "Math renderer failed");
          })
        : Promise.resolve(),
      result.hasHighlightedCode
        ? highlightCodeBlocks(context.root, context.isCurrent).catch((error: unknown) => {
            warnings.push(error instanceof Error ? error.message : "Code highlighter failed");
          })
        : Promise.resolve(),
      result.diagrams.length > 0
        ? this.diagrams.renderAll(context.root, result.diagrams, {
            theme: context.update.theme,
            generation: context.update.generation,
            isCurrent: context.isCurrent
          })
        : Promise.resolve()
    ]);

    return warnings.length > 0 ? { warnings } : {};
  }

  public dispose(): void {
    // The shell owns the shared diagram renderer; no Markdown-specific state persists.
  }
}

export function revokeObjectUrls(root: ParentNode): void {
  for (const element of root.querySelectorAll<HTMLElement>("[data-mpp-object-url]")) {
    const url = element.dataset.mppObjectUrl;
    if (url) URL.revokeObjectURL(url);
    delete element.dataset.mppObjectUrl;
  }
}
