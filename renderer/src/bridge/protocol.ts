export const PROTOCOL_VERSION = 2 as const;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_RESOURCE_BYTES = 512 * 1024 * 1024;

export type Theme = "light" | "dark" | "system";

export type ViewerFormat =
  | "markdown"
  | "mermaid"
  | "plantuml"
  | "html"
  | "svg"
  | "json"
  | "yaml"
  | "xml"
  | "csv"
  | "tsv"
  | "openapi"
  | "pdf"
  | "image"
  | "plain-text";

export interface ViewerSettings {
  showFrontMatter: boolean;
  showTableOfContents: boolean;
  rawHtml: boolean;
  remoteImages: boolean;
  mathAlternateDelimiters: boolean;
  codeWrapping: boolean;
  formatOverride: ViewerFormat | "auto";
  maximumTextBytes: number;
  maximumStructuredBytes: number;
  maximumCsvRows: number;
  maximumCsvColumns: number;
  maximumCsvCellBytes: number;
  maximumResourceBytes: number;
}

export type RendererSettings = ViewerSettings;

export interface PreviewFile {
  name: string;
  extension: string;
  saved: boolean;
}

export interface TextSource {
  kind: "text";
  text: string;
}

export interface ResourceSource {
  kind: "resource";
  token: string;
  url: string;
  size: number;
  mediaType: string;
}

export interface UnavailableSource {
  kind: "unavailable";
  reason: string;
}

export type PreviewSource = TextSource | ResourceSource | UnavailableSource;

export interface PreviewUpdate {
  type: "preview.update";
  protocolVersion: typeof PROTOCOL_VERSION;
  generation: number;
  bufferId: number;
  formatHint: ViewerFormat;
  file: PreviewFile;
  /** Opaque token for constrained relative resources; never a filesystem path. */
  directoryToken?: string;
  source: PreviewSource;
  theme: Theme;
  settings: ViewerSettings;
}

/** @deprecated Use PreviewUpdate. Kept as a source-compatible type alias for adapters. */
export type DocumentUpdate = PreviewUpdate;

export interface RendererReadyMessage {
  type: "renderer.ready";
  protocolVersion: typeof PROTOCOL_VERSION;
}

export interface RenderCompleteMessage {
  type: "render.complete";
  protocolVersion: typeof PROTOCOL_VERSION;
  generation: number;
}

export interface RenderErrorMessage {
  type: "render.error";
  protocolVersion: typeof PROTOCOL_VERSION;
  generation: number;
  message: string;
}

export interface OpenLinkMessage {
  type: "link.open";
  protocolVersion: typeof PROTOCOL_VERSION;
  href: string;
}

export interface OpenLocalResourceMessage {
  type: "localResource.open";
  protocolVersion: typeof PROTOCOL_VERSION;
  href: string;
  documentDirectoryToken?: string;
}

export type RendererMessage =
  | RendererReadyMessage
  | RenderCompleteMessage
  | RenderErrorMessage
  | OpenLinkMessage
  | OpenLocalResourceMessage;

export type HostMessage = PreviewUpdate;

const MEDIA_TYPES = new Set([
  "application/pdf",
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/x-icon"
]);

const VIEWER_FORMATS = new Set<ViewerFormat>([
  "markdown", "mermaid", "plantuml", "html", "svg", "json", "yaml", "xml", "csv", "tsv",
  "openapi", "pdf", "image", "plain-text"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSafeInteger(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function isViewerFormat(value: unknown): value is ViewerFormat {
  return typeof value === "string" && VIEWER_FORMATS.has(value as ViewerFormat);
}

function isSettings(value: unknown): value is ViewerSettings {
  if (!isRecord(value)) return false;
  return (
    typeof value.showFrontMatter === "boolean" &&
    typeof value.showTableOfContents === "boolean" &&
    typeof value.rawHtml === "boolean" &&
    typeof value.remoteImages === "boolean" &&
    typeof value.mathAlternateDelimiters === "boolean" &&
    typeof value.codeWrapping === "boolean" &&
    (value.formatOverride === "auto" || isViewerFormat(value.formatOverride)) &&
    isSafeInteger(value.maximumTextBytes, 1, MAX_DOCUMENT_BYTES) &&
    isSafeInteger(value.maximumStructuredBytes, 1, MAX_DOCUMENT_BYTES) &&
    isSafeInteger(value.maximumCsvRows, 1, 100_000) &&
    isSafeInteger(value.maximumCsvColumns, 1, 1_000) &&
    isSafeInteger(value.maximumCsvCellBytes, 1, 4 * 1024 * 1024) &&
    isSafeInteger(value.maximumResourceBytes, 1, MAX_RESOURCE_BYTES)
  );
}

function isSafeToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && /^[A-Za-z0-9._~-]+$/u.test(value);
}

function isResourceUrl(value: unknown, token: string): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  return value === `https://doc.local/file/${encodeURIComponent(token)}`;
}

function isFile(value: unknown): value is PreviewFile {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === "string" &&
    value.name.length > 0 &&
    value.name.length <= 260 &&
    !/[\\/\u0000-\u001f\u007f]/u.test(value.name) &&
    typeof value.extension === "string" &&
    value.extension.length <= 32 &&
    /^\.?[A-Za-z0-9_-]*$/u.test(value.extension) &&
    typeof value.saved === "boolean"
  );
}

function isSource(value: unknown, format: ViewerFormat, maximumTextBytes: number): value is PreviewSource {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "text") {
    return typeof value.text === "string" && new TextEncoder().encode(value.text).byteLength <= maximumTextBytes;
  }
  if (value.kind === "unavailable") {
    return typeof value.reason === "string" && value.reason.length > 0 && value.reason.length <= 1000;
  }
  if (value.kind !== "resource") return false;
  return (
    isSafeToken(value.token) &&
    isResourceUrl(value.url, value.token) &&
    isSafeInteger(value.size, 0, MAX_RESOURCE_BYTES) &&
    typeof value.mediaType === "string" &&
    MEDIA_TYPES.has(value.mediaType) &&
    ((format === "pdf" && value.mediaType === "application/pdf") ||
      (format === "image" && value.mediaType.startsWith("image/")))
  );
}

export function isPreviewUpdate(value: unknown): value is PreviewUpdate {
  if (!isRecord(value) || !isViewerFormat(value.formatHint) || !isSettings(value.settings)) return false;
  return (
    value.type === "preview.update" &&
    value.protocolVersion === PROTOCOL_VERSION &&
    isSafeInteger(value.generation) &&
    isSafeInteger(value.bufferId) &&
    isFile(value.file) &&
    (value.directoryToken === undefined || isSafeToken(value.directoryToken)) &&
    isSource(value.source, value.formatHint, value.settings.maximumTextBytes) &&
    isTheme(value.theme)
  );
}

/** @deprecated Use isPreviewUpdate. */
export const isDocumentUpdate = isPreviewUpdate;

export function isSafeMessageUrl(value: string): boolean {
  if (value.length === 0 || value.length > 4096) return false;
  if (/[\u0000-\u001f\u007f\\]/u.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function makeReadyMessage(): RendererReadyMessage {
  return { type: "renderer.ready", protocolVersion: PROTOCOL_VERSION };
}

export function makeRenderCompleteMessage(generation: number): RenderCompleteMessage {
  return { type: "render.complete", protocolVersion: PROTOCOL_VERSION, generation };
}

export function makeRenderErrorMessage(generation: number, message: string): RenderErrorMessage {
  return {
    type: "render.error",
    protocolVersion: PROTOCOL_VERSION,
    generation,
    message: message.slice(0, 1000)
  };
}

export function textSource(update: PreviewUpdate): string | undefined {
  return update.source.kind === "text" ? update.source.text : undefined;
}
