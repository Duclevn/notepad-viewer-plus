import { createOwnedObjectUrl, revokeOwnedObjectUrl, trackOwnedObjectUrl } from "../object-urls";
import { sanitizeStandaloneSvg } from "../security/sanitize";
import { createArtboardControls } from "./artboard";
import type { ViewerAdapter, ViewerContext, ViewerResult } from "./types";

export class SvgViewer implements ViewerAdapter {
  public readonly id = "svg" as const;
  public readonly themeBehavior = "selectable-canvas" as const;
  private objectUrl: string | undefined;

  public canRender(context: ViewerContext): boolean {
    return context.update.source.kind === "text" &&
      (context.update.formatHint === "svg" || context.update.settings.formatOverride === "svg");
  }

  public async render(context: ViewerContext): Promise<ViewerResult> {
    this.revoke();
    context.root.replaceChildren();
    if (context.update.source.kind !== "text") {
      context.root.textContent = context.update.source.kind === "unavailable" ? context.update.source.reason : "SVG source is unavailable.";
      return {};
    }
    const sanitized = sanitizeStandaloneSvg(context.update.source.text.slice(0, context.update.settings.maximumTextBytes));
    if (!/^\s*<svg[\s>]/iu.test(sanitized)) {
      context.root.appendChild(errorMessage("SVG is malformed or contains no safe root element."));
      return {};
    }
    const image = document.createElement("img");
    image.className = "mpp-svg-viewer";
    image.alt = context.update.file.name;
    this.objectUrl = createOwnedObjectUrl(new Blob([sanitized], { type: "image/svg+xml" }));
    image.src = this.objectUrl;
    trackOwnedObjectUrl(image, this.objectUrl);

    const viewport = document.createElement("div");
    viewport.className = "mpp-image-viewport mpp-svg-viewport mpp-artboard";
    viewport.appendChild(image);
    const toolbar = document.createElement("div");
    toolbar.className = "mpp-image-toolbar";
    toolbar.appendChild(createArtboardControls(viewport, "light"));
    context.root.append(toolbar, viewport);
    return {};
  }

  public dispose(): void {
    this.revoke();
  }

  private revoke(): void {
    revokeOwnedObjectUrl(this.objectUrl);
    this.objectUrl = undefined;
  }
}

function errorMessage(message: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "mpp-inline-error";
  element.setAttribute("role", "alert");
  element.textContent = message;
  return element;
}
