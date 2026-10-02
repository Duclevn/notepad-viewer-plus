import { makeDocumentResourceUrl } from "../security/resource-policy";
import { sanitizeHtml } from "../security/sanitize";
import type { ViewerAdapter, ViewerContext, ViewerResult } from "./types";

const FRAME_CSP = "default-src 'none'; img-src https://doc.local data:; style-src 'none'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none';";

export class HtmlViewer implements ViewerAdapter {
  public readonly id = "html" as const;
  public readonly themeBehavior = "light-canvas" as const;

  public canRender(context: ViewerContext): boolean {
    return context.update.source.kind === "text" &&
      (context.update.formatHint === "html" || context.update.settings.formatOverride === "html");
  }

  public async render(context: ViewerContext): Promise<ViewerResult> {
    context.root.replaceChildren();
    if (context.update.source.kind !== "text") {
      context.root.textContent = context.update.source.kind === "unavailable" ? context.update.source.reason : "HTML source is unavailable.";
      return {};
    }
    const template = document.createElement("template");
    template.innerHTML = sanitizeHtml(context.update.source.text.slice(0, context.update.settings.maximumTextBytes), true);
    for (const image of template.content.querySelectorAll<HTMLImageElement>("img")) {
      const source = image.getAttribute("src")?.trim() ?? "";
      const rewritten = makeDocumentResourceUrl(context.directoryToken, source);
      if (rewritten) image.setAttribute("src", rewritten);
      else image.removeAttribute("src");
    }
    for (const link of template.content.querySelectorAll<HTMLAnchorElement>("a")) {
      const href = link.getAttribute("href")?.trim() ?? "";
      if (!href.startsWith("#")) link.removeAttribute("href");
    }
    const frame = document.createElement("iframe");
    frame.className = "mpp-html-viewer";
    frame.title = context.update.file.name;
    frame.setAttribute("sandbox", "");
    frame.referrerPolicy = "no-referrer";
    frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}"><meta name="color-scheme" content="light"><body bgcolor="#ffffff" text="#1f2328">${template.innerHTML}</body>`;
    context.root.appendChild(frame);
    return {};
  }

  public dispose(): void {}
}
