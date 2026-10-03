import { DiagramRenderer } from "../diagrams/diagrams";
import { releaseOwnedObjectUrls } from "../object-urls";
import { highlightCodeBlocks } from "../markdown/code";
import { renderMathPlaceholders } from "../markdown/math";
import { MarkdownPipeline, type TableOfContentsEntry } from "../markdown/pipeline";
import { textSource } from "../bridge/protocol";
import { applyResourcePolicy } from "../security/resource-policy";
import type { ViewerAdapter, ViewerContext, ViewerResult } from "./types";

export class MarkdownViewer implements ViewerAdapter {
  public readonly id = "markdown" as const;
  public readonly themeBehavior = "native" as const;
  private readonly pipeline = new MarkdownPipeline();
  private tocOpen: boolean | undefined;
  private tocStateKey: string | undefined;
  private tocSetting: boolean | undefined;

  public constructor(private readonly diagrams: DiagramRenderer) {}

  public canRender(context: ViewerContext): boolean {
    return context.update.source.kind === "text" &&
      (context.update.formatHint === "markdown" || context.update.settings.formatOverride === "markdown");
  }

  public async render(context: ViewerContext): Promise<ViewerResult> {
    this.diagrams.cancelCurrentUpdate();
    const result = await this.pipeline.render(context.update, context.isCurrent);
    if (!context.isCurrent()) return {};

    releaseOwnedObjectUrls(context.root);
    if (result.fallback !== undefined) {
      const fallback = document.createElement("pre");
      fallback.className = "mpp-raw-fallback";
      fallback.textContent = textSource(context.update) ?? result.fallback;
      context.root.replaceChildren(fallback);
      const warnings = [...(result.warnings ?? [])];
      if (!warnings.includes(result.fallback)) warnings.push(result.fallback);
      return { warnings };
    }

    context.root.innerHTML = result.html;
    mountMarkdownLayout(context.root, result.toc, this.resolveTocOpen(context), (open) => {
      this.tocOpen = open;
    });
    applyResourcePolicy(context.root, {
      documentDirectoryToken: context.directoryToken,
      remoteImages: context.update.settings.remoteImages
    });

    const warnings: string[] = [...(result.warnings ?? [])];
    await Promise.all([
      result.math.length > 0
        ? renderMathPlaceholders(context.root, result.math, context.effectiveTheme, context.isCurrent).catch((error: unknown) => {
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
            theme: context.effectiveTheme,
            generation: context.update.generation,
            isCurrent: context.isCurrent
          })
        : Promise.resolve()
    ]);

    return warnings.length > 0 ? { warnings } : {};
  }

  public dispose(): void {
    // The shell owns the shared diagram renderer. Keep the local TOC state across live refreshes.
  }

  private resolveTocOpen(context: ViewerContext): boolean {
    const setting = context.update.settings.showTableOfContents;
    const stateKey = `${context.update.bufferId}:${context.update.file.name}`;
    if (this.tocOpen === undefined || this.tocStateKey !== stateKey || this.tocSetting !== setting) {
      this.tocOpen = setting;
    }
    this.tocStateKey = stateKey;
    this.tocSetting = setting;
    return this.tocOpen;
  }
}

function mountMarkdownLayout(
  root: HTMLElement,
  entries: TableOfContentsEntry[],
  initiallyOpen: boolean,
  onToggle: (open: boolean) => void
): void {
  const documentContent = document.createElement("div");
  documentContent.className = "mpp-markdown-document";
  documentContent.append(...Array.from(root.childNodes));

  const shell = document.createElement("div");
  shell.className = "mpp-markdown-shell";

  const toolbar = document.createElement("div");
  toolbar.className = "mpp-markdown-toolbar";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "mpp-viewer-button mpp-toc-toggle";
  toggle.setAttribute("aria-label", "Toggle table of contents");
  toggle.setAttribute("title", "Toggle table of contents");
  toggle.textContent = "☰";
  toggle.disabled = entries.length === 0;

  const panel = document.createElement("aside");
  panel.className = "mpp-toc";
  panel.id = "mpp-markdown-toc";
  toggle.setAttribute("aria-controls", panel.id);
  panel.setAttribute("aria-label", "Table of contents");
  const panelTitle = document.createElement("div");
  panelTitle.className = "mpp-toc-title";
  panelTitle.textContent = "Table of contents";
  const list = document.createElement("ul");
  list.className = "mpp-toc-list";
  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = `mpp-toc-level-${entry.level}`;
    const link = document.createElement("a");
    link.href = `#${entry.id}`;
    link.textContent = entry.title;
    item.appendChild(link);
    list.appendChild(item);
  }
  panel.append(panelTitle, list);

  const layout = document.createElement("div");
  layout.className = "mpp-markdown-layout";
  layout.append(documentContent);
  toolbar.append(toggle, panel);
  shell.append(toolbar, layout);
  root.replaceChildren(shell);

  const setOpen = (open: boolean, notify = false): void => {
    const visible = open && entries.length > 0;
    panel.hidden = !visible;
    shell.classList.toggle("mpp-toc-open", visible);
    toggle.setAttribute("aria-expanded", String(visible));
    toggle.classList.toggle("mpp-toc-toggle-open", visible);
    if (notify) onToggle(visible);
  };
  toggle.addEventListener("click", () => setOpen(Boolean(panel.hidden), true));
  setOpen(initiallyOpen);
}


export function revokeObjectUrls(root: ParentNode): void {
  releaseOwnedObjectUrls(root);
}
