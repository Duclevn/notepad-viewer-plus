import type { ViewerAdapter, ViewerContext, ViewerResult } from "./types";

export class PlainTextViewer implements ViewerAdapter {
  public readonly id = "plain-text" as const;

  public canRender(_context: ViewerContext): boolean {
    return true;
  }

  public async render(context: ViewerContext): Promise<ViewerResult> {
    context.root.replaceChildren();
    const pre = document.createElement("pre");
    pre.className = "mpp-plain-text-viewer";
    if (context.update.source.kind === "text") pre.textContent = context.update.source.text;
    else if (context.update.source.kind === "unavailable") pre.textContent = context.update.source.reason;
    else pre.textContent = "This resource cannot be displayed as text.";
    context.root.appendChild(pre);
    return {};
  }

  public dispose(): void {}
}
