import { DiagramRenderer, type DiagramEngine, type DiagramPlaceholder } from "../diagrams/diagrams";
import { releaseAllOwnedObjectUrls, releaseOwnedObjectUrls } from "../object-urls";
import type { ViewerAdapter, ViewerContext, ViewerResult } from "./types";

export class DiagramViewer implements ViewerAdapter {
  public readonly themeBehavior = "theme-aware" as const;

  public constructor(
    public readonly id: "mermaid" | "plantuml",
    private readonly diagrams: DiagramRenderer
  ) {}

  public canRender(context: ViewerContext): boolean {
    return context.update.source.kind === "text" &&
      (context.update.formatHint === this.id || context.update.settings.formatOverride === this.id);
  }

  public async render(context: ViewerContext): Promise<ViewerResult> {
    if (context.update.source.kind !== "text") throw new Error(`${this.id} viewer requires a text source`);
    this.diagrams.cancelCurrentUpdate();
    releaseOwnedObjectUrls(context.root);
    releaseAllOwnedObjectUrls();
    const id = `standalone-${this.id}-${context.update.generation}`;
    const placeholder: DiagramPlaceholder = {
      id,
      engine: this.id as DiagramEngine,
      source: context.update.source.text
    };
    context.root.innerHTML = `<section class="mpp-diagram" data-mpp-diagram="${id}" data-mpp-engine="${this.id}" aria-live="polite"><div class="mpp-diagram-loading">Rendering ${this.id} diagram…</div></section>`;
    await this.diagrams.renderAll(context.root, [placeholder], {
      theme: context.effectiveTheme,
      generation: context.update.generation,
      isCurrent: context.isCurrent
    });
    return {};
  }

  public dispose(): void {}
}
