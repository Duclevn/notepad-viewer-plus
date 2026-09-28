import type { RendererBridge } from "../bridge/bridge";

const EXTERNAL_SCHEMES = new Set(["http:", "https:"]);

export function isExternalHttpUrl(value: string): boolean {
  try {
    return EXTERNAL_SCHEMES.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function isFragmentUrl(value: string): boolean {
  return value.startsWith("#") && !value.includes("\\");
}

export function isSafeRelativePath(value: string): boolean {
  if (!value || value.startsWith("/") || value.startsWith("\\") || value.startsWith("//")) return false;
  if (/^[a-z][a-z\d+.-]*:/iu.test(value)) return false;
  const pathOnly = value.split(/[?#]/u, 1)[0] ?? "";
  const segments = pathOnly.replaceAll("\\", "/").split("/");
  return !segments.some((segment) => segment === "..");
}

export function makeDocumentResourceUrl(token: string | undefined, href: string): string | undefined {
  if (!token || token.length > 256 || !isSafeRelativePath(href)) return undefined;
  const [path = "", queryAndFragment] = href.replaceAll("\\", "/").split(/(?=[?#])/u, 2);
  const encodedPath = path
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://doc.local/resource/${encodeURIComponent(token)}/${encodedPath}${queryAndFragment ?? ""}`;
}

export interface ResourcePolicyOptions {
  documentDirectoryToken?: string;
  remoteImages: boolean;
}

export function applyResourcePolicy(root: ParentNode, options: ResourcePolicyOptions): void {
  for (const image of root.querySelectorAll<HTMLImageElement>("img")) {
    const src = image.getAttribute("src")?.trim() ?? "";
    if (isExternalHttpUrl(src)) {
      if (!options.remoteImages || !src.startsWith("https://")) {
        image.removeAttribute("src");
        image.setAttribute("data-mpp-blocked-resource", "remote-image");
        image.setAttribute("alt", `${image.getAttribute("alt") ?? "Image"} (remote image blocked)`);
      }
      continue;
    }
    if (src.startsWith("blob:") || src.startsWith("data:image/")) continue;
    const rewritten = makeDocumentResourceUrl(options.documentDirectoryToken, src);
    if (rewritten) {
      image.setAttribute("src", rewritten);
    } else {
      image.removeAttribute("src");
      image.setAttribute("data-mpp-blocked-resource", "local-path");
    }
  }
}

export function bindResourceEvents(root: HTMLElement, bridge: RendererBridge, getDocumentDirectoryToken: () => string | undefined): void {
  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : undefined;
    const link = target?.closest("a");
    if (!link) return;
    const href = link.getAttribute("href")?.trim() ?? "";
    if (isFragmentUrl(href)) return;
    event.preventDefault();
    if (isExternalHttpUrl(href)) {
      bridge.post({ type: "link.open", protocolVersion: 1, href });
      return;
    }
    const documentDirectoryToken = getDocumentDirectoryToken();
    if (makeDocumentResourceUrl(documentDirectoryToken, href)) {
      bridge.post({ type: "localResource.open", protocolVersion: 1, href, documentDirectoryToken });
    }
  });

  root.addEventListener("error", (event) => {
    const target = event.target instanceof HTMLImageElement ? event.target : undefined;
    if (!target) return;
    target.replaceWith(
      Object.assign(document.createElement("span"), {
        className: "mpp-inline-error",
        textContent: `Image could not be loaded: ${target.alt || "unnamed image"}`
      })
    );
  }, true);
}
