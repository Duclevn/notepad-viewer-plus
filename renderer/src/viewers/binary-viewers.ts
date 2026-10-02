import { createArtboardControls } from "./artboard";
import type { ViewerAdapter, ViewerContext, ViewerResult } from "./types";

export class ImageViewer implements ViewerAdapter {
  public readonly id = "image" as const;
  public readonly themeBehavior = "selectable-canvas" as const;
  private cleanup: (() => void) | undefined;

  public canRender(context: ViewerContext): boolean {
    return context.update.source.kind === "resource" &&
      (context.update.formatHint === "image" || context.update.settings.formatOverride === "image");
  }

  public async render(context: ViewerContext): Promise<ViewerResult> {
    this.cleanup?.();
    this.cleanup = undefined;
    context.root.replaceChildren();
    if (context.update.source.kind !== "resource") {
      context.root.appendChild(unavailable(context.update.source.kind === "unavailable" ? context.update.source.reason : "Image source is unavailable."));
      return {};
    }

    const toolbar = document.createElement("div");
    toolbar.className = "mpp-image-toolbar";
    const image = document.createElement("img");
    image.className = "mpp-image-viewer mpp-image-fit";
    image.alt = context.update.file.name;
    image.src = context.update.source.url;
    image.decoding = "async";
    image.draggable = false;

    const viewport = document.createElement("div");
    viewport.className = "mpp-image-viewport mpp-artboard";
    viewport.appendChild(image);
    const scaleLabel = document.createElement("span");
    scaleLabel.className = "mpp-image-scale";
    scaleLabel.textContent = "Fit";

    let scale = 1;
    let actual = false;
    const setScale = (value: number): void => {
      scale = Math.max(0.1, Math.min(8, value));
      image.style.transform = `scale(${scale})`;
      image.classList.toggle("mpp-image-fit", !actual);
      scaleLabel.textContent = actual ? `${Math.round(scale * 100)}%` : "Fit";
    };
    const setActual = (): void => {
      actual = true;
      setScale(1);
    };
    const setFit = (): void => {
      actual = false;
      image.style.transform = "scale(1)";
      image.classList.add("mpp-image-fit");
      scaleLabel.textContent = "Fit";
    };
    const button = (label: string, action: () => void): HTMLButtonElement => {
      const result = document.createElement("button");
      result.type = "button";
      result.className = "mpp-viewer-button";
      result.textContent = label;
      result.addEventListener("click", action);
      return result;
    };
    toolbar.append(
      button("Fit", setFit),
      button("Actual size", setActual),
      button("−", () => { actual = true; setScale(scale / 1.25); }),
      button("+", () => { actual = true; setScale(scale * 1.25); }),
      button("Reset", () => { actual = false; setFit(); }),
      scaleLabel,
      createArtboardControls(viewport, "checkerboard")
    );
    context.root.append(toolbar, viewport);
    const onError = (): void => image.replaceWith(unavailable("Image could not be decoded or loaded."));
    image.addEventListener("error", onError, { once: true });
    this.cleanup = (): void => image.removeEventListener("error", onError);
    return {};
  }

  public dispose(): void {
    this.cleanup?.();
    this.cleanup = undefined;
  }
}

export class PdfViewer implements ViewerAdapter {
  public readonly id = "pdf" as const;
  public readonly themeBehavior = "isolated" as const;

  public canRender(context: ViewerContext): boolean {
    return context.update.source.kind === "resource" &&
      (context.update.formatHint === "pdf" || context.update.settings.formatOverride === "pdf");
  }

  public async render(context: ViewerContext): Promise<ViewerResult> {
    context.root.replaceChildren();
    if (context.update.source.kind !== "resource") {
      context.root.appendChild(unavailable(context.update.source.kind === "unavailable" ? context.update.source.reason : "PDF source is unavailable."));
      return {};
    }
    const frame = document.createElement("iframe");
    frame.className = "mpp-pdf-viewer";
    frame.title = context.update.file.name;
    frame.referrerPolicy = "no-referrer";
    // Chromium/WebView2's built-in PDF viewer does not render inside a sandboxed iframe.
    // The exact-file URL remains isolated from the app origin and is guarded by the native
    // navigation/resource policy, so do not copy the HTML viewer's sandbox here.
    frame.src = context.update.source.url;
    context.root.appendChild(frame);
    return {};
  }

  public dispose(): void {}
}

function unavailable(message: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "mpp-viewer-unavailable";
  element.setAttribute("role", "status");
  element.textContent = message;
  return element;
}
