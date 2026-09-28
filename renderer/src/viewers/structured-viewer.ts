import { sanitizeHtml } from "../security/sanitize";
import type { ViewerAdapter, ViewerContext, ViewerResult } from "./types";

export type StructuredValue = null | boolean | number | string | StructuredValue[] | { [key: string]: StructuredValue };

interface ParseResult {
  value?: StructuredValue;
  error?: string;
}

interface RenderState {
  nodes: number;
  maxNodes: number;
  maxDepth: number;
  maxString: number;
}

const MAX_DEFAULT_NODES = 20_000;
const MAX_DEFAULT_DEPTH = 100;
const MAX_DEFAULT_STRING = 64 * 1024;

export class StructuredDataViewer implements ViewerAdapter {
  public readonly id = "json" as const;

  public canRender(context: ViewerContext): boolean {
    return context.update.source.kind === "text" &&
      (context.update.formatHint === "json" || context.update.formatHint === "yaml" || context.update.formatHint === "xml" ||
       context.update.settings.formatOverride === "json" || context.update.settings.formatOverride === "yaml" ||
       context.update.settings.formatOverride === "xml" || context.update.settings.formatOverride === "openapi");
  }

  public async render(context: ViewerContext): Promise<ViewerResult> {
    if (context.update.source.kind !== "text") {
      renderRaw(context.root, "Structured-data source is unavailable.", "Source unavailable");
      return {};
    }
    const source = context.update.source.text;
    if (new TextEncoder().encode(source).byteLength > context.update.settings.maximumStructuredBytes) {
      renderRaw(context.root, source, "Structured-data input exceeds the configured limit");
      return {};
    }
    const override = context.update.settings.formatOverride;
    const yamlExtension = context.update.file.extension === ".yaml" || context.update.file.extension === ".yml";
    const format = override === "yaml" ? "yaml" : override === "xml" ? "xml" :
      (override === "openapi" && (context.update.formatHint === "yaml" || yamlExtension)) || context.update.formatHint === "yaml" ? "yaml" :
      context.update.formatHint === "xml" ? "xml" : "json";
    const parsed = await parseStructured(source, format);
    if (!context.isCurrent()) return {};
    if (parsed.error || parsed.value === undefined) {
      renderRaw(context.root, source, parsed.error ?? "Structured-data input is empty");
      return {};
    }
    if (isOpenApiDocument(parsed.value)) {
      const refs = validateOpenApiRefs(parsed.value);
      if (refs.length > 0) {
        renderRaw(context.root, source, `OpenAPI references are not allowed: ${refs[0] ?? "invalid reference"}`);
        return {};
      }
      try {
        await renderOpenApiWithSwagger(context.root, parsed.value, context.isCurrent);
        return {};
      } catch {
        if (!context.isCurrent()) return {};
        renderOpenApiFallback(context.root, parsed.value);
        return { warnings: ["The local Swagger UI chunk could not be loaded; a safe documentation fallback was shown."] };
      }
    }
    renderTree(context.root, parsed.value, {
      maxNodes: MAX_DEFAULT_NODES,
      maxDepth: MAX_DEFAULT_DEPTH,
      maxString: MAX_DEFAULT_STRING
    });
    return {};
  }

  public dispose(): void {}
}

export async function parseStructured(source: string, format: "json" | "yaml" | "xml"): Promise<ParseResult> {
  try {
    if (format === "json") return { value: normalizeJson(JSON.parse(source)) };
    if (format === "yaml") {
      const yaml = await import("js-yaml");
      const value = yaml.load(source, { schema: yaml.FAILSAFE_SCHEMA, json: true });
      return { value: normalizeJson(value) };
    }
    return parseXml(source);
  } catch (error) {
    return { error: error instanceof Error ? error.message.slice(0, 500) : "Structured-data parsing failed" };
  }
}

function parseXml(source: string): ParseResult {
  if (/<!(?:DOCTYPE|ENTITY)\b/iu.test(source)) return { error: "DTD and entity declarations are disabled" };
  const document = new DOMParser().parseFromString(source, "application/xml");
  if (document.querySelector("parsererror") || !document.documentElement) return { error: "XML is malformed" };
  const state = { nodes: 0 };
  try {
    return { value: xmlElementToValue(document.documentElement, state, 0) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "XML exceeds the rendering limits" };
  }
}

function xmlElementToValue(element: Element, state: { nodes: number }, depth: number): StructuredValue {
  if (++state.nodes > MAX_DEFAULT_NODES || depth > MAX_DEFAULT_DEPTH) throw new Error("XML exceeds the rendering limits");
  const result: { [key: string]: StructuredValue } = {};
  if (element.attributes.length > 0) {
    const attributes: { [key: string]: StructuredValue } = {};
    for (const attribute of Array.from(element.attributes)) attributes[attribute.name] = trimString(attribute.value);
    result["@attributes"] = attributes;
  }
  const text = Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE)
    .map((node) => node.nodeValue ?? "")
    .join("")
    .trim();
  if (text) result["#text"] = trimString(text);
  for (const child of Array.from(element.children)) {
    const childValue = xmlElementToValue(child, state, depth + 1);
    const previous = result[child.tagName];
    if (previous === undefined) result[child.tagName] = childValue;
    else if (Array.isArray(previous)) previous.push(childValue);
    else result[child.tagName] = [previous, childValue];
  }
  return { [element.tagName]: result };
}

function normalizeJson(value: unknown, depth = 0, state = { nodes: 0 }): StructuredValue {
  if (++state.nodes > MAX_DEFAULT_NODES || depth > MAX_DEFAULT_DEPTH) throw new Error("Structured data exceeds the rendering limits");
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return trimString(value);
  if (Array.isArray(value)) return value.map((item) => normalizeJson(item, depth + 1, state));
  if (typeof value === "object") {
    const object: { [key: string]: StructuredValue } = {};
    for (const [key, item] of Object.entries(value)) object[key] = normalizeJson(item, depth + 1, state);
    return object;
  }
  return String(value);
}

function trimString(value: string): string {
  return value.length > MAX_DEFAULT_STRING ? `${value.slice(0, MAX_DEFAULT_STRING)}…` : value;
}

function renderTree(root: HTMLElement, value: StructuredValue, limits: Omit<RenderState, "nodes">): void {
  root.replaceChildren();
  const container = document.createElement("section");
  container.className = "mpp-structured-viewer";
  container.setAttribute("aria-label", "Structured data tree");
  const state: RenderState = { ...limits, nodes: 0 };
  container.appendChild(renderValue(value, "$", 0, state));
  if (state.nodes >= state.maxNodes) container.appendChild(limitWarning("The tree was truncated at the configured node limit."));
  root.appendChild(container);
}

function renderValue(value: StructuredValue, path: string, depth: number, state: RenderState): HTMLElement {
  if (++state.nodes > state.maxNodes || depth > state.maxDepth) return limitWarning("… rendering limit reached");
  if (value !== null && typeof value === "object") {
    const details = document.createElement("details");
    details.className = "mpp-tree-node";
    details.open = depth < 2;
    const summary = document.createElement("summary");
    summary.append(pathLabel(path, value));
    summary.appendChild(copyButton(path, value));
    details.appendChild(summary);
    const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item] as const) : Object.entries(value);
    for (const [key, item] of entries) {
      const childPath = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`;
      details.appendChild(renderValue(item, childPath, depth + 1, state));
      if (state.nodes >= state.maxNodes) break;
    }
    return details;
  }
  const row = document.createElement("div");
  row.className = "mpp-tree-value";
  row.append(pathLabel(path, value), copyButton(path, value));
  return row;
}

function pathLabel(path: string, value: StructuredValue): Text {
  const label = typeof value === "string" ? value : value === null ? "null" : String(value);
  return document.createTextNode(`${path}: ${label}`);
}

function copyButton(path: string, value: StructuredValue): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mpp-copy-value";
  button.textContent = "Copy";
  button.setAttribute("aria-label", `Copy ${path}`);
  button.dataset.mppCopyPath = path;
  button.dataset.mppCopyValue = value === null || typeof value !== "object" ? String(value) : JSON.stringify(value);
  return button;
}

function limitWarning(message: string): HTMLElement {
  const warning = document.createElement("span");
  warning.className = "mpp-tree-limit";
  warning.textContent = message;
  return warning;
}

function renderRaw(root: HTMLElement, source: string, message: string): void {
  root.replaceChildren();
  const warning = document.createElement("div");
  warning.className = "mpp-warning";
  warning.setAttribute("role", "alert");
  warning.textContent = message;
  const pre = document.createElement("pre");
  pre.className = "mpp-raw-fallback";
  pre.textContent = source;
  root.append(warning, pre);
}

export function isOpenApiDocument(value: StructuredValue): value is { [key: string]: StructuredValue } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return typeof value.openapi === "string" || value.swagger === "2.0";
}

export function validateOpenApiRefs(value: StructuredValue): string[] {
  const invalid: string[] = [];
  const visit = (current: StructuredValue, path: string): void => {
    if (invalid.length > 0) return;
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!current || typeof current !== "object") return;
    for (const [key, item] of Object.entries(current)) {
      const itemPath = `${path}.${key}`;
      if (key === "$ref") {
        if (typeof item !== "string" || !item.startsWith("#") || item.includes("\\") || /^#(?:https?:|\/\/)/iu.test(item)) {
          invalid.push(`${itemPath}: only same-document fragment references are allowed`);
          return;
        }
      }
      visit(item, itemPath);
    }
  };
  visit(value, "$" );
  return invalid;
}

async function renderOpenApiWithSwagger(
  root: HTMLElement,
  documentValue: { [key: string]: StructuredValue },
  isCurrent: () => boolean
): Promise<void> {
  const stylesheet = await import("swagger-ui-dist/swagger-ui.css");
  void stylesheet;
  const module = await import("swagger-ui-dist/swagger-ui-bundle.js");
  if (!isCurrent()) return;
  const bundle = module.default;
  if (typeof bundle !== "function") throw new Error("Swagger UI bundle is unavailable");
  root.replaceChildren();
  const container = document.createElement("div");
  container.className = "mpp-openapi-viewer swagger-ui";
  root.appendChild(container);
  const safeSpec = sanitizeOpenApiValue(documentValue) as Record<string, unknown>;
  bundle({
    domNode: container,
    spec: safeSpec,
    supportedSubmitMethods: [],
    validatorUrl: null,
    tryItOutEnabled: false,
    persistAuthorization: false,
    docExpansion: "list",
    defaultModelExpandDepth: 2,
    defaultModelsExpandDepth: -1,
    requestInterceptor: () => {
      throw new Error("OpenAPI requests are disabled in offline documentation view");
    }
  });
}

export function sanitizeOpenApiValue(value: StructuredValue): StructuredValue {
  if (typeof value === "string") {
    const withoutLinks = value
      .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
      .replace(/\[([^\]]*)\]\[[^\]]*\]/gu, "$1")
      .replace(/<((?:https?|file|data|javascript):[^>]+)>/giu, "[external reference removed]")
      .replace(/\b(?:https?|file|data|javascript):[^\s<>)]+/giu, "[external reference removed]");
    const template = document.createElement("template");
    template.innerHTML = sanitizeHtml(withoutLinks, false);
    return template.content.textContent ?? "";
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeOpenApiValue(item));
  if (value && typeof value === "object") {
    const result: { [key: string]: StructuredValue } = {};
    for (const [key, item] of Object.entries(value)) result[key] = sanitizeOpenApiValue(item);
    return result;
  }
  return value;
}

function renderOpenApiFallback(root: HTMLElement, documentValue: { [key: string]: StructuredValue }): void {
  root.replaceChildren();
  const container = document.createElement("section");
  container.className = "mpp-openapi-viewer";
  const title = document.createElement("h2");
  title.textContent = typeof documentValue.info === "object" && documentValue.info && !Array.isArray(documentValue.info) && typeof documentValue.info.title === "string"
    ? documentValue.info.title
    : "OpenAPI documentation";
  container.appendChild(title);
  const version = document.createElement("p");
  version.className = "mpp-muted";
  version.textContent = `${typeof documentValue.openapi === "string" ? `OpenAPI ${documentValue.openapi}` : "Swagger 2.0"} · Try it out and network requests are disabled.`;
  container.appendChild(version);

  const paths = documentValue.paths;
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) {
    container.appendChild(limitWarning("The specification has no paths."));
    root.appendChild(container);
    return;
  }
  const list = document.createElement("div");
  list.className = "mpp-openapi-paths";
  for (const [path, operations] of Object.entries(paths)) {
    if (!operations || typeof operations !== "object" || Array.isArray(operations)) continue;
    for (const [method, operation] of Object.entries(operations)) {
      if (!["get", "put", "post", "delete", "patch", "head", "options", "trace"].includes(method.toLowerCase())) continue;
      const card = document.createElement("article");
      card.className = "mpp-openapi-operation";
      const heading = document.createElement("h3");
      heading.textContent = `${method.toUpperCase()} ${path}`;
      card.appendChild(heading);
      if (operation && typeof operation === "object" && !Array.isArray(operation)) {
        const summary = operation.summary ?? operation.description;
        if (typeof summary === "string") {
          const description = document.createElement("div");
          description.innerHTML = sanitizeHtml(summary, false);
          card.appendChild(description);
        }
      }
      list.appendChild(card);
    }
  }
  container.appendChild(list);
  root.appendChild(container);
}
