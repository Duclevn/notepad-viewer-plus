import DOMPurify from "dompurify";

const HTML_TAGS = [
  "a", "abbr", "article", "aside", "b", "blockquote", "br", "button", "code", "col", "colgroup", "dd", "del", "details", "div", "dl", "dt", "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "input", "kbd", "li", "main", "mark", "ol", "p", "pre", "q", "s", "section", "small", "source", "span", "strong", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr", "u", "ul", "var", "video"
];

const HTML_ATTRIBUTES = [
  "alt", "aria-describedby", "aria-expanded", "aria-label", "aria-live", "checked", "class", "colspan", "data-admonition-type", "data-copy-code", "data-mpp-code", "data-mpp-language", "data-mpp-math", "data-mpp-diagram", "data-mpp-engine", "data-mpp-id", "datetime", "disabled", "download", "height", "href", "id", "lang", "loading", "name", "open", "rel", "role", "scope", "src", "start", "summary", "target", "title", "type", "value", "width"
];

const SAFE_HTML_URL = /^(?:(?:https?|mailto):|blob:|data:image\/(?:png|gif|jpeg|webp);)/iu;
const URL_ATTRIBUTES = ["href", "src"] as const;
const SVG_TAGS = [
  "svg", "g", "defs", "style", "title", "desc", "marker", "path", "polygon", "polyline", "rect", "circle",
  "ellipse", "line", "text", "tspan", "filter", "feDropShadow", "feGaussianBlur", "feOffset", "feFlood",
  "feComposite", "feMerge", "feMergeNode", "clipPath", "mask", "pattern", "linearGradient", "radialGradient", "stop"
];
const SVG_ATTRIBUTES = [
  "alignment-baseline", "aria-roledescription", "class", "color", "cx", "cy", "d", "dominant-baseline", "dx", "dy", "fill", "fill-opacity", "fill-rule",
  "flood-color", "flood-opacity", "font-family", "font-size", "font-style", "font-weight", "height", "id",
  "marker-end", "marker-mid", "marker-start", "markerHeight", "markerUnits", "markerWidth", "opacity", "orient",
  "points", "preserveAspectRatio", "r", "refX", "refY", "role", "rx", "ry", "stdDeviation", "stroke",
  "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity",
  "shape-rendering", "stroke-width", "style", "text-anchor", "transform", "version", "viewBox", "visibility", "width", "x", "x1", "x2",
  "xml:space", "xmlns", "y", "y1", "y2"
];
const MATH_STYLE_PROPERTIES = new Set(["color", "height", "margin-right", "top", "vertical-align", "width"]);
const LOCAL_CSS_FRAGMENT = /^#[A-Za-z_][A-Za-z0-9_.:-]*$/u;
const MAX_SVG_DIMENSION = 10_000;

function commonConfig(rawHtml: boolean): Parameters<typeof DOMPurify.sanitize>[1] {
  return {
    ALLOWED_TAGS: HTML_TAGS,
    ALLOWED_ATTR: HTML_ATTRIBUTES,
    ALLOW_DATA_ATTR: true,
    ALLOW_ARIA_ATTR: true,
    KEEP_CONTENT: true,
    FORBID_TAGS: rawHtml ? ["base", "embed", "form", "iframe", "meta", "object", "script", "style", "template"] : ["base", "embed", "form", "iframe", "meta", "object", "script", "style", "template", "details"],
    FORBID_ATTR: ["style", "srcdoc", "formaction", "xlink:href"]
  };
}

export function sanitizeHtml(html: string, rawHtml: boolean): string {
  const sanitized = DOMPurify.sanitize(stripInlineStyleMarkup(html), commonConfig(rawHtml));
  const template = document.createElement("template");
  template.innerHTML = sanitized;
  for (const attribute of URL_ATTRIBUTES) {
    for (const element of template.content.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
      const value = element.getAttribute(attribute)?.trim() ?? "";
      if (!isSafeHtmlUrl(value)) element.removeAttribute(attribute);
    }
  }
  return template.innerHTML;
}

function isSafeHtmlUrl(value: string): boolean {
  if (!value || /[\u0000-\u001F\u007F]/u.test(value) || value.startsWith("//") || value.startsWith("\\")) return false;
  if (SAFE_HTML_URL.test(value) || value.startsWith("#") || value.startsWith("/")) return true;
  return !/^[A-Za-z][A-Za-z\d+.-]*:/u.test(value);
}

export function sanitizeGeneratedMath(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true },
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "foreignObject"],
    FORBID_ATTR: ["src", "href", "xlink:href"]
  });
  const template = document.createElement("template");
  template.innerHTML = sanitized;
  for (const element of template.content.querySelectorAll<HTMLElement>("[style]")) {
    const safe = sanitizeInlineStyle(element.getAttribute("style") ?? "", MATH_STYLE_PROPERTIES);
    if (safe) element.setAttribute("style", safe);
    else element.removeAttribute("style");
  }
  return template.innerHTML;
}

export function sanitizeStandaloneSvg(svg: string): string {
  const allowedTags = [...SVG_TAGS, "image"];
  const allowedAttributes = [...SVG_ATTRIBUTES, "alt", "href", "xlink:href"];
  const sanitized = DOMPurify.sanitize(svg, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttributes,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: true,
    FORBID_TAGS: ["script", "foreignObject", "iframe", "object", "embed"],
    FORBID_ATTR: ["onload", "onclick", "onerror", "srcdoc"]
  });
  const parsed = new DOMParser().parseFromString(sanitized, "image/svg+xml");
  if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg") return "";
  const root = parsed.documentElement;
  for (const style of root.querySelectorAll("style")) style.remove();
  for (const element of [root, ...Array.from(root.querySelectorAll<SVGElement>("*"))]) {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/iu.test(attribute.name) || /(?:javascript|vbscript|file|https?):/iu.test(attribute.value) || /url\s*\(/iu.test(attribute.value)) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if ((attribute.name === "href" || attribute.name === "xlink:href") &&
          !(element.localName === "image" && /^data:image\/(?:png|gif|jpeg|webp);/iu.test(attribute.value))) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  normalizeSvgDimensions(root);
  return new XMLSerializer().serializeToString(root);
}

export function sanitizeSvg(svg: string): string {
  const sanitized = DOMPurify.sanitize(svg, {
    ALLOWED_TAGS: SVG_TAGS,
    ALLOWED_ATTR: SVG_ATTRIBUTES,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: true,
    FORBID_TAGS: ["script", "foreignObject", "iframe", "object", "embed", "image"],
    FORBID_ATTR: ["onload", "onclick", "onerror", "href", "xlink:href"]
  });
  const parsed = new DOMParser().parseFromString(sanitized, "image/svg+xml");
  if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg") return "";
  const root = parsed.documentElement;
  for (const style of root.querySelectorAll("style")) {
    style.textContent = sanitizeCssText(style.textContent ?? "");
  }
  for (const element of [root, ...Array.from(root.querySelectorAll<SVGElement>("[style]"))]) {
    if (!element.hasAttribute("style")) continue;
    const safe = sanitizeCssText(element.getAttribute("style") ?? "");
    if (safe.trim()) element.setAttribute("style", safe);
    else element.removeAttribute("style");
  }
  for (const element of [root, ...Array.from(root.querySelectorAll<SVGElement>("*"))]) {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/iu.test(attribute.name)) element.removeAttribute(attribute.name);
      else if (/url\s*\(/iu.test(attribute.value)) {
        const safe = sanitizeCssText(attribute.value);
        if (safe.trim()) element.setAttribute(attribute.name, safe);
        else element.removeAttribute(attribute.name);
      }
    }
  }
  normalizeSvgDimensions(root);
  return new XMLSerializer().serializeToString(root);
}

function sanitizeInlineStyle(value: string, allowedProperties: ReadonlySet<string>): string {
  const declarations: string[] = [];
  for (const declaration of value.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator <= 0) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const rawValue = declaration.slice(separator + 1).trim();
    if (!allowedProperties.has(property) || !rawValue) continue;
    const safeValue = sanitizeCssText(rawValue).trim();
    if (safeValue && safeValue !== "none") declarations.push(`${property}: ${safeValue}`);
  }
  return declarations.join("; ");
}

function sanitizeCssText(value: string): string {
  const localReferences: string[] = [];
  let sanitized = value.replace(/url\(\s*(['"]?)(#[A-Za-z_][A-Za-z0-9_.:-]*)\1\s*\)/giu, (_match, _quote: string, target: string) => {
    if (!LOCAL_CSS_FRAGMENT.test(target)) return "none";
    const token = `__MPP_LOCAL_URL_${localReferences.length}__`;
    localReferences.push(`url(${target})`);
    return token;
  });
  sanitized = sanitized
    .replace(/url\s*\([^)]*\)/giu, "none")
    .replace(/url\s*\([^;\}]*(?=;|\}|$)/giu, "none")
    .replace(/none\)+/giu, "none")
    .replace(/@import\s+[^;]*(?:;|$)/giu, "")
    .replace(/@font-face\s*\{[^\}]*\}/giu, "")
    .replace(/(?:behavior|-moz-binding)\s*:[^;\}]*(?=;|\}|$)/giu, "")
    .replace(/expression\s*\([^;\}]*(?=;|\}|$)/giu, "")
    .replace(/(?:javascript|vbscript|data|file|https?):\s*/giu, "");
  localReferences.forEach((reference, index) => {
    sanitized = sanitized.replaceAll(`__MPP_LOCAL_URL_${index}__`, reference);
  });
  return sanitized;
}

function normalizeSvgDimensions(root: Element): void {
  const viewBox = root.getAttribute("viewBox")?.trim().split(/[\s,]+/u).map(Number);
  const candidateWidth = viewBox?.[2];
  const candidateHeight = viewBox?.[3];
  const viewWidth = viewBox?.length === 4 && candidateWidth !== undefined && Number.isFinite(candidateWidth) && candidateWidth > 0 ? candidateWidth : undefined;
  const viewHeight = viewBox?.length === 4 && candidateHeight !== undefined && Number.isFinite(candidateHeight) && candidateHeight > 0 ? candidateHeight : undefined;
  const numericDimension = (name: string): number | undefined => {
    const value = root.getAttribute(name)?.trim();
    if (!value || !/^[0-9]+(?:\.[0-9]+)?(?:px)?$/u.test(value)) return undefined;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };
  let width = numericDimension("width") ?? viewWidth;
  let height = numericDimension("height") ?? viewHeight;
  if (!width || !height) return;
  const scale = Math.min(1, MAX_SVG_DIMENSION / width, MAX_SVG_DIMENSION / height);
  width = Math.max(1, Math.ceil(width * scale));
  height = Math.max(1, Math.ceil(height * scale));
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
}

function stripInlineStyleMarkup(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/giu, "")
    .replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "");
}

export function escapeText(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}
