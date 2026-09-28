export const PROTOCOL_VERSION = 1 as const;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export type Theme = "light" | "dark" | "system";

export interface RendererSettings {
  showFrontMatter: boolean;
  showTableOfContents: boolean;
  rawHtml: boolean;
  remoteImages: boolean;
  mathAlternateDelimiters: boolean;
  codeWrapping: boolean;
}

export interface DocumentUpdate {
  type: "document.update";
  protocolVersion: typeof PROTOCOL_VERSION;
  generation: number;
  bufferId: number;
  text: string;
  theme: Theme;
  documentDirectoryToken?: string;
  settings: RendererSettings;
}

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

export type HostMessage = DocumentUpdate;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function isSettings(value: unknown): value is RendererSettings {
  if (!isRecord(value)) return false;
  return (
    typeof value.showFrontMatter === "boolean" &&
    typeof value.showTableOfContents === "boolean" &&
    typeof value.rawHtml === "boolean" &&
    typeof value.remoteImages === "boolean" &&
    typeof value.mathAlternateDelimiters === "boolean" &&
    typeof value.codeWrapping === "boolean"
  );
}

export function isDocumentUpdate(value: unknown): value is DocumentUpdate {
  if (!isRecord(value)) return false;
  const text = value.text;
  return (
    value.type === "document.update" &&
    value.protocolVersion === PROTOCOL_VERSION &&
    typeof value.generation === "number" &&
    Number.isSafeInteger(value.generation) &&
    value.generation >= 0 &&
    typeof value.bufferId === "number" &&
    Number.isSafeInteger(value.bufferId) &&
    typeof text === "string" &&
    new TextEncoder().encode(text).byteLength <= MAX_DOCUMENT_BYTES &&
    isTheme(value.theme) &&
    isSettings(value.settings) &&
    (value.documentDirectoryToken === undefined ||
      (typeof value.documentDirectoryToken === "string" && value.documentDirectoryToken.length <= 256))
  );
}

export function isSafeMessageUrl(value: string): boolean {
  if (value.length === 0 || value.length > 4096) return false;
  if (/[\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const parsed = new URL(value, "https://doc.local/");
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return true;
    return parsed.protocol === "";
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
