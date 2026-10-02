import type { ViewerFormat } from "../bridge/protocol";
import { DiagramRenderer } from "../diagrams/diagrams";
import { DelimitedViewer } from "./delimited-viewer";
import { ImageViewer, PdfViewer } from "./binary-viewers";
import { DiagramViewer } from "./diagram-viewer";
import { HtmlViewer } from "./html-viewer";
import { MarkdownViewer } from "./markdown-viewer";
import { PlainTextViewer } from "./plain-text-viewer";
import { StructuredDataViewer } from "./structured-viewer";
import { SvgViewer } from "./svg-viewer";
import type { ViewerAdapter, ViewerContext, ViewerResult } from "./types";

export class ViewerRegistry {
  private readonly diagrams = new DiagramRenderer();
  private readonly adapters: ViewerAdapter[] = [
    new MarkdownViewer(this.diagrams),
    new DiagramViewer("mermaid", this.diagrams),
    new DiagramViewer("plantuml", this.diagrams),
    new HtmlViewer(),
    new SvgViewer(),
    new StructuredDataViewer(),
    new DelimitedViewer(),
    new ImageViewer(),
    new PdfViewer(),
    new PlainTextViewer()
  ];

  public resolve(context: ViewerContext): ViewerAdapter {
    const requested = context.update.settings.formatOverride === "auto"
      ? context.update.formatHint
      : context.update.settings.formatOverride;
    const requestedId = requested === "openapi" ? "json" : requested;
    const exact = this.adapters.find((adapter) => adapter.id === requestedId && adapter.canRender(context));
    if (exact) return exact;
    const detected = this.adapters.find((adapter) => adapter.canRender(context));
    return detected ?? this.adapters[this.adapters.length - 1]!;
  }

  public async render(context: ViewerContext): Promise<ViewerResult> {
    const adapter = this.resolve(context);
    context.root.dataset.mppThemeBehavior = adapter.themeBehavior;
    return adapter.render(context);
  }

  public dispose(): void {
    for (const adapter of this.adapters) adapter.dispose();
    this.diagrams.dispose();
  }

  public get adapterIds(): readonly ViewerFormat[] {
    return this.adapters.map((adapter) => adapter.id);
  }
}
