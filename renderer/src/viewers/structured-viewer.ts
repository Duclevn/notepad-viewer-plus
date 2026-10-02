import { highlightCodeBlocks } from "../markdown/code";
import { sanitizeHtml } from "../security/sanitize";
import type { ViewerAdapter, ViewerContext, ViewerResult } from "./types";

export type StructuredValue = null | boolean | number | string | StructuredValue[] | { [key: string]: StructuredValue };

interface ParseResult {
  value?: StructuredValue;
  error?: string;
}

interface RenderLimits {
  maxNodes: number;
  maxDepth: number;
  maxString: number;
}

interface RenderState extends RenderLimits {
  nodes: number;
  truncated: boolean;
}

const MAX_DEFAULT_NODES = 20_000;
const MAX_DEFAULT_DEPTH = 100;
const MAX_DEFAULT_STRING = 64 * 1024;

export class StructuredDataViewer implements ViewerAdapter {
  public readonly id = "json" as const;
  public readonly themeBehavior = "native" as const;

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
    renderStructuredViewer(context.root, parsed.value, source, format, {
      maxNodes: MAX_DEFAULT_NODES,
      maxDepth: MAX_DEFAULT_DEPTH,
      maxString: MAX_DEFAULT_STRING
    }, context.isCurrent);
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

function renderStructuredViewer(
  root: HTMLElement,
  value: StructuredValue,
  rawSource: string,
  format: "json" | "yaml" | "xml",
  limits: RenderLimits,
  isCurrent: () => boolean
): void {
  root.replaceChildren();
  const container = document.createElement("section");
  container.className = "mpp-structured-viewer";
  container.setAttribute("aria-label", "Structured data viewer");

  const state: RenderState = { ...limits, nodes: 0, truncated: false };

  const formatLabel = format.toUpperCase();
  let statsLabel = "";
  if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      statsLabel = `${value.length} ${value.length === 1 ? "item" : "items"}`;
    } else {
      const keys = Object.keys(value).length;
      statsLabel = `${keys} ${keys === 1 ? "property" : "properties"}`;
    }
  } else {
    statsLabel = typeof value;
  }

  // Toolbar
  const toolbar = document.createElement("div");
  toolbar.className = "mpp-structured-toolbar";

  // Tab switcher
  const tabs = document.createElement("div");
  tabs.className = "mpp-view-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "View mode");

  const treeTab = document.createElement("button");
  treeTab.type = "button";
  treeTab.className = "mpp-view-tab mpp-tab-active";
  treeTab.dataset.mppView = "tree";
  treeTab.setAttribute("role", "tab");
  treeTab.setAttribute("aria-selected", "true");
  treeTab.textContent = "Tree";

  const codeTab = document.createElement("button");
  codeTab.type = "button";
  codeTab.className = "mpp-view-tab";
  codeTab.dataset.mppView = "code";
  codeTab.setAttribute("role", "tab");
  codeTab.setAttribute("aria-selected", "false");
  codeTab.textContent = "Code";

  tabs.append(treeTab, codeTab);

  // Tree controls
  const treeControls = document.createElement("div");
  treeControls.className = "mpp-tree-controls";

  const expandAllBtn = document.createElement("button");
  expandAllBtn.type = "button";
  expandAllBtn.className = "mpp-toolbar-btn mpp-expand-all";
  expandAllBtn.title = "Expand all nodes";
  expandAllBtn.textContent = "Expand all";

  const collapseAllBtn = document.createElement("button");
  collapseAllBtn.type = "button";
  collapseAllBtn.className = "mpp-toolbar-btn mpp-collapse-all";
  collapseAllBtn.title = "Collapse all nodes";
  collapseAllBtn.textContent = "Collapse all";

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "mpp-tree-search";
  searchInput.placeholder = "Filter keys or values…";
  searchInput.setAttribute("aria-label", "Filter structured tree");

  treeControls.append(expandAllBtn, collapseAllBtn, searchInput);

  // Toolbar end: metadata + copy all
  const toolbarEnd = document.createElement("div");
  toolbarEnd.className = "mpp-toolbar-end";

  const metaSpan = document.createElement("span");
  metaSpan.className = "mpp-tree-meta";
  metaSpan.textContent = `${formatLabel} • ${statsLabel}`;

  const formattedText = format === "json" ? JSON.stringify(value, null, 2) : rawSource;

  const copyAllBtn = document.createElement("button");
  copyAllBtn.type = "button";
  copyAllBtn.className = "mpp-toolbar-btn mpp-copy-raw";
  copyAllBtn.textContent = "Copy";
  copyAllBtn.title = `Copy formatted ${formatLabel}`;
  copyAllBtn.dataset.mppCopyValue = formattedText;

  toolbarEnd.append(metaSpan, copyAllBtn);
  toolbar.append(tabs, treeControls, toolbarEnd);

  // Tree pane
  const treePane = document.createElement("div");
  treePane.className = "mpp-structured-tree-pane";

  const treeContent = renderStructuredNode(null, value, "$", 0, state);
  treePane.appendChild(treeContent);

  if (state.truncated) {
    treePane.appendChild(limitWarning("The tree was truncated at the configured node limit."));
  }

  // Code pane
  const codePane = document.createElement("div");
  codePane.className = "mpp-structured-code-pane";
  codePane.hidden = true;

  const codeBlock = document.createElement("div");
  codeBlock.className = "mpp-code-block";
  codeBlock.dataset.mppCode = "code-structured";
  codeBlock.dataset.mppLanguage = format;

  const codeToolbar = document.createElement("div");
  codeToolbar.className = "mpp-code-toolbar";
  const codeLang = document.createElement("span");
  codeLang.className = "mpp-code-language";
  codeLang.textContent = formatLabel;
  const copyCodeBtn = document.createElement("button");
  copyCodeBtn.type = "button";
  copyCodeBtn.className = "mpp-copy-code";
  copyCodeBtn.dataset.copyCode = "code-structured";
  copyCodeBtn.textContent = "Copy";
  codeToolbar.append(codeLang, copyCodeBtn);

  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.className = `language-${format}`;
  code.textContent = formattedText;
  pre.appendChild(code);
  codeBlock.append(codeToolbar, pre);
  codePane.appendChild(codeBlock);

  // Event handlers
  let codeHighlighted = false;
  const switchView = async (mode: "tree" | "code") => {
    if (mode === "tree") {
      treeTab.classList.add("mpp-tab-active");
      treeTab.setAttribute("aria-selected", "true");
      codeTab.classList.remove("mpp-tab-active");
      codeTab.setAttribute("aria-selected", "false");
      treePane.hidden = false;
      codePane.hidden = true;
      treeControls.hidden = false;
    } else {
      codeTab.classList.add("mpp-tab-active");
      codeTab.setAttribute("aria-selected", "true");
      treeTab.classList.remove("mpp-tab-active");
      treeTab.setAttribute("aria-selected", "false");
      treePane.hidden = true;
      codePane.hidden = false;
      treeControls.hidden = true;
      if (!codeHighlighted) {
        codeHighlighted = true;
        try {
          await highlightCodeBlocks(codePane, isCurrent);
        } catch {
          // Fallback to unhighlighted code block if highlighting fails
        }
      }
    }
  };

  treeTab.addEventListener("click", () => void switchView("tree"));
  codeTab.addEventListener("click", () => void switchView("code"));

  expandAllBtn.addEventListener("click", () => {
    treePane.querySelectorAll<HTMLDetailsElement>("details.mpp-tree-node").forEach((d) => (d.open = true));
  });

  collapseAllBtn.addEventListener("click", () => {
    treePane.querySelectorAll<HTMLDetailsElement>("details.mpp-tree-node").forEach((d) => (d.open = false));
    const rootDetails = treePane.querySelector<HTMLDetailsElement>("details.mpp-tree-node");
    if (rootDetails) rootDetails.open = true;
  });

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    const allItems = treePane.querySelectorAll<HTMLElement>(".mpp-tree-node, .mpp-tree-leaf");
    if (!query) {
      container.classList.remove("mpp-filtering");
      allItems.forEach((item) => item.classList.remove("mpp-match", "mpp-dim"));
      return;
    }
    container.classList.add("mpp-filtering");
    allItems.forEach((item) => {
      const text = item.dataset.mppSearchText?.toLowerCase() ?? "";
      const matches = text.includes(query);
      if (matches) {
        item.classList.add("mpp-match");
        item.classList.remove("mpp-dim");
        let parent = item.parentElement?.closest<HTMLDetailsElement>("details.mpp-tree-node");
        while (parent) {
          parent.open = true;
          parent.classList.remove("mpp-dim");
          parent = parent.parentElement?.closest<HTMLDetailsElement>("details.mpp-tree-node");
        }
      } else {
        item.classList.remove("mpp-match");
        item.classList.add("mpp-dim");
      }
    });
  });

  container.append(toolbar, treePane, codePane);
  root.appendChild(container);
}

function renderStructuredNode(
  key: string | null,
  value: StructuredValue,
  path: string,
  depth: number,
  state: RenderState
): HTMLElement {
  if (++state.nodes > state.maxNodes || depth > state.maxDepth) {
    state.truncated = true;
    return limitWarning("… rendering limit reached");
  }

  // Object
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const details = document.createElement("details");
    details.className = "mpp-tree-node";
    details.open = depth < 2;

    const entries = Object.entries(value);
    const count = entries.length;
    const badgeText = `${count} ${count === 1 ? "prop" : "props"}`;
    const keysPreview = previewObjectKeys(entries);
    details.dataset.mppSearchText = `${key ?? ""} ${entries.map(([k]) => k).join(" ")}`;

    const summary = document.createElement("summary");
    summary.className = "mpp-tree-summary";

    const line = document.createElement("span");
    line.className = "mpp-tree-line";

    const arrow = document.createElement("span");
    arrow.className = "mpp-tree-arrow";
    line.appendChild(arrow);

    if (key !== null) {
      const keySpan = document.createElement("span");
      keySpan.className = "mpp-tree-key";
      keySpan.textContent = key;
      const colonSpan = document.createElement("span");
      colonSpan.className = "mpp-tree-colon";
      colonSpan.textContent = ": ";
      line.append(keySpan, colonSpan);
    }

    const openBracket = document.createElement("span");
    openBracket.className = "mpp-tree-bracket";
    openBracket.textContent = "{";
    line.appendChild(openBracket);

    const badge = document.createElement("span");
    badge.className = "mpp-tree-collapsed-badge";
    badge.textContent = badgeText;
    line.appendChild(badge);

    if (keysPreview) {
      const previewSpan = document.createElement("span");
      previewSpan.className = "mpp-tree-preview";
      previewSpan.textContent = keysPreview;
      line.appendChild(previewSpan);
    }

    const closeSummaryBracket = document.createElement("span");
    closeSummaryBracket.className = "mpp-tree-bracket mpp-tree-closing-bracket";
    closeSummaryBracket.textContent = "}";
    line.appendChild(closeSummaryBracket);

    line.appendChild(createRowActions(path, value));
    summary.appendChild(line);
    details.appendChild(summary);

    const childrenContainer = document.createElement("div");
    childrenContainer.className = "mpp-tree-children";

    for (const [childKey, childValue] of entries) {
      const childPath = formatChildPath(path, childKey, false);
      childrenContainer.appendChild(renderStructuredNode(childKey, childValue, childPath, depth + 1, state));
      if (state.nodes >= state.maxNodes) break;
    }

    details.appendChild(childrenContainer);

    const closeLine = document.createElement("div");
    closeLine.className = "mpp-tree-close-line";
    const closingBracket = document.createElement("span");
    closingBracket.className = "mpp-tree-bracket";
    closingBracket.textContent = "}";
    closeLine.appendChild(closingBracket);
    details.appendChild(closeLine);

    return details;
  }

  // Array
  if (Array.isArray(value)) {
    const details = document.createElement("details");
    details.className = "mpp-tree-node";
    details.open = depth < 2;

    const count = value.length;
    const badgeText = `${count} ${count === 1 ? "item" : "items"}`;
    details.dataset.mppSearchText = `${key ?? ""}`;

    const summary = document.createElement("summary");
    summary.className = "mpp-tree-summary";

    const line = document.createElement("span");
    line.className = "mpp-tree-line";

    const arrow = document.createElement("span");
    arrow.className = "mpp-tree-arrow";
    line.appendChild(arrow);

    if (key !== null) {
      const keySpan = document.createElement("span");
      keySpan.className = isNumeric(key) ? "mpp-tree-index" : "mpp-tree-key";
      keySpan.textContent = isNumeric(key) ? `[${key}]` : key;
      const colonSpan = document.createElement("span");
      colonSpan.className = "mpp-tree-colon";
      colonSpan.textContent = ": ";
      line.append(keySpan, colonSpan);
    }

    const openBracket = document.createElement("span");
    openBracket.className = "mpp-tree-bracket";
    openBracket.textContent = "[";
    line.appendChild(openBracket);

    const badge = document.createElement("span");
    badge.className = "mpp-tree-collapsed-badge";
    badge.textContent = badgeText;
    line.appendChild(badge);

    const closeSummaryBracket = document.createElement("span");
    closeSummaryBracket.className = "mpp-tree-bracket mpp-tree-closing-bracket";
    closeSummaryBracket.textContent = "]";
    line.appendChild(closeSummaryBracket);

    line.appendChild(createRowActions(path, value));
    summary.appendChild(line);
    details.appendChild(summary);

    const childrenContainer = document.createElement("div");
    childrenContainer.className = "mpp-tree-children";

    for (let index = 0; index < value.length; ++index) {
      const childPath = formatChildPath(path, String(index), true);
      childrenContainer.appendChild(renderStructuredNode(String(index), value[index]!, childPath, depth + 1, state));
      if (state.nodes >= state.maxNodes) break;
    }

    details.appendChild(childrenContainer);

    const closeLine = document.createElement("div");
    closeLine.className = "mpp-tree-close-line";
    const closingBracket = document.createElement("span");
    closingBracket.className = "mpp-tree-bracket";
    closingBracket.textContent = "]";
    closeLine.appendChild(closingBracket);
    details.appendChild(closeLine);

    return details;
  }

  // Primitive
  const leaf = document.createElement("div");
  leaf.className = "mpp-tree-leaf";
  leaf.dataset.mppSearchText = `${key ?? ""} ${value === null ? "null" : String(value)}`;

  const line = document.createElement("span");
  line.className = "mpp-tree-line";

  const bullet = document.createElement("span");
  bullet.className = "mpp-tree-bullet";
  line.appendChild(bullet);

  if (key !== null) {
    const keySpan = document.createElement("span");
    keySpan.className = isNumeric(key) ? "mpp-tree-index" : "mpp-tree-key";
    keySpan.textContent = isNumeric(key) ? `[${key}]` : key;
    const colonSpan = document.createElement("span");
    colonSpan.className = "mpp-tree-colon";
    colonSpan.textContent = ": ";
    line.append(keySpan, colonSpan);
  }

  const valueSpan = document.createElement("span");
  if (typeof value === "string") {
    valueSpan.className = "mpp-tree-string";
    valueSpan.textContent = `"${value}"`;
  } else if (typeof value === "number") {
    valueSpan.className = "mpp-tree-number";
    valueSpan.textContent = String(value);
  } else if (typeof value === "boolean") {
    valueSpan.className = "mpp-tree-boolean";
    valueSpan.textContent = String(value);
  } else {
    valueSpan.className = "mpp-tree-null";
    valueSpan.textContent = "null";
  }
  line.appendChild(valueSpan);

  line.appendChild(createRowActions(path, value));
  leaf.appendChild(line);
  return leaf;
}

function previewObjectKeys(entries: [string, StructuredValue][]): string {
  if (entries.length === 0) return "";
  const maxKeys = 4;
  const keys = entries.slice(0, maxKeys).map(([k]) => k);
  if (entries.length > maxKeys) keys.push("…");
  return `{ ${keys.join(", ")} }`;
}

function isNumeric(value: string): boolean {
  return /^[0-9]+$/u.test(value);
}

function formatChildPath(parentPath: string, key: string, isArray: boolean): string {
  if (isArray) return `${parentPath}[${key}]`;
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key)) return `${parentPath}.${key}`;
  return `${parentPath}[${JSON.stringify(key)}]`;
}

function createRowActions(path: string, value: StructuredValue): HTMLElement {
  const actions = document.createElement("span");
  actions.className = "mpp-tree-actions";

  const copyVal = document.createElement("button");
  copyVal.type = "button";
  copyVal.className = "mpp-tree-copy-btn";
  copyVal.textContent = "Copy";
  copyVal.title = "Copy value";
  copyVal.setAttribute("aria-label", `Copy value at ${path}`);
  copyVal.dataset.mppCopyValue = value === null || typeof value !== "object" ? String(value) : JSON.stringify(value, null, 2);

  const copyPath = document.createElement("button");
  copyPath.type = "button";
  copyPath.className = "mpp-tree-copy-btn";
  copyPath.textContent = "Path";
  copyPath.title = "Copy JSONPath";
  copyPath.setAttribute("aria-label", `Copy path ${path}`);
  copyPath.dataset.mppCopyValue = path;

  actions.append(copyVal, copyPath);
  return actions;
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
