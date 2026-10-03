import MarkdownIt from "markdown-it";
import { MAX_MATH_EXPRESSIONS } from "../performance/limits";
import { escapeText } from "../security/sanitize";

export interface MathPlaceholder {
  id: string;
  expression: string;
  displayMode: boolean;
}

export interface MathOptions {
  alternateDelimiters: boolean;
  generation: number;
}

interface MathTokenMeta {
  id?: string;
  literal?: string;
}

interface InlineState {
  src: string;
  pos: number;
  push(type: string, tag: string, nesting: number): { meta?: unknown };
}

interface MathFrameRequest {
  type: "render";
  expression: string;
  displayMode: boolean;
  theme: "light" | "dark";
}

interface MathFrameResponse {
  ok: boolean;
  width?: number;
  height?: number;
  message?: string;
}

function findClosing(source: string, start: number, delimiter: string): number {
  let cursor = start;
  while (cursor < source.length) {
    const found = source.indexOf(delimiter, cursor);
    if (found < 0) return -1;
    if (found === 0 || source[found - 1] !== "\\") return found;
    cursor = found + delimiter.length;
  }
  return -1;
}

export function installMathPlugin(
  md: InstanceType<typeof MarkdownIt>,
  placeholders: MathPlaceholder[],
  options: MathOptions
): { skipped: number } {
  const state = { skipped: 0 };
  let sequence = 0;
  const register = (expression: string, displayMode: boolean): string | undefined => {
    if (placeholders.length >= MAX_MATH_EXPRESSIONS) {
      state.skipped += 1;
      return undefined;
    }
    const id = `math-${options.generation}-${sequence++}`;
    placeholders.push({ id, expression, displayMode });
    return id;
  };

  md.inline.ruler.before("escape", "mpp_math", (state: InlineState, silent: boolean): boolean => {
    const start = state.pos;
    const source = state.src;
    let delimiter: string | undefined;
    let displayMode = false;

    if (source.startsWith("$$", start)) {
      delimiter = "$$";
      displayMode = true;
    } else if (source[start] === "$") {
      delimiter = "$";
    } else if (options.alternateDelimiters && source.startsWith("\\[", start)) {
      delimiter = "\\]";
      displayMode = true;
    } else if (options.alternateDelimiters && source.startsWith("\\(", start)) {
      delimiter = "\\)";
    }
    if (!delimiter) return false;

    const openingLength = delimiter === "\\]" || delimiter === "\\)" ? 2 : delimiter.length;
    const contentStart = start + openingLength;
    if (!displayMode && delimiter === "$" && /\s/u.test(source[contentStart] ?? "")) return false;
    const closing = findClosing(source, contentStart, delimiter);
    if (closing < 0 || closing === contentStart) return false;
    const expression = source.slice(contentStart, closing);
    if (expression.length > 8192) return false;
    if (silent) return true;

    const token = state.push(displayMode ? "mpp_math_display" : "mpp_math_inline", "", 0);
    const id = register(expression, displayMode);
    token.meta = id
      ? { id } satisfies MathTokenMeta
      : { literal: source.slice(start, closing + delimiter.length) } satisfies MathTokenMeta;
    state.pos = closing + delimiter.length;
    return true;
  });

  md.renderer.rules.mpp_math_inline = (tokens, index): string => {
    const meta = tokens[index]?.meta as MathTokenMeta | undefined;
    if (!meta?.id) return escapeText(meta?.literal ?? "");
    return `<span class="mpp-math-placeholder" data-mpp-math="${meta.id}"></span>`;
  };
  md.renderer.rules.mpp_math_display = (tokens, index): string => {
    const meta = tokens[index]?.meta as MathTokenMeta | undefined;
    if (!meta?.id) return escapeText(meta?.literal ?? "");
    return `<div class="mpp-math-placeholder mpp-math-display" data-mpp-math="${meta.id}"></div>`;
  };

  const previousFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, index, optionsArg, env, self): string => {
    const token = tokens[index];
    if (token?.info.trim().toLowerCase() === "math") {
      const expression = token.content.replace(/\r?\n$/u, "");
      const id = register(expression, true);
      if (!id) return `<pre class="mpp-math-skipped"><code>${escapeText(token.content)}</code></pre>`;
      return `<div class="mpp-math-placeholder mpp-math-display" data-mpp-math="${id}"></div>`;
    }
    return previousFence ? previousFence(tokens, index, optionsArg, env, self) : self.renderToken(tokens, index, optionsArg);
  };
  return state;
}

export async function renderMathPlaceholders(
  root: ParentNode,
  placeholders: MathPlaceholder[],
  theme: "light" | "dark",
  isCurrent: () => boolean = () => true
): Promise<void> {
  for (const placeholder of placeholders.slice(0, MAX_MATH_EXPRESSIONS)) {
    if (!isCurrent()) return;
    const element = root.querySelector<HTMLElement>(`[data-mpp-math="${placeholder.id}"]`);
    if (!element) continue;
    const frame = document.createElement("iframe");
    frame.className = placeholder.displayMode ? "mpp-math-frame mpp-math-display-frame" : "mpp-math-frame";
    frame.title = "Rendered mathematical expression";
    frame.setAttribute("aria-label", "Rendered mathematical expression");
    frame.setAttribute("sandbox", "allow-scripts");
    element.replaceWith(frame);

    try {
      const response = await renderInFrame(frame, placeholder, theme, isCurrent);
      if (!isCurrent()) {
        frame.remove();
        return;
      }
      if (!response.ok) throw new Error(response.message ?? "Math expression could not be rendered");
      frame.setAttribute("height", String(clamp(response.height ?? 24, 24, 10_000)));
      if (!placeholder.displayMode) frame.setAttribute("width", String(clamp(response.width ?? 40, 40, 10_000)));
    } catch (error) {
      if (!isCurrent()) {
        frame.remove();
        return;
      }
      const message = document.createElement("span");
      message.className = "mpp-inline-error";
      message.textContent = error instanceof Error ? error.message : "Math expression could not be rendered";
      frame.replaceWith(message);
    }
  }
}

async function renderInFrame(
  frame: HTMLIFrameElement,
  placeholder: MathPlaceholder,
  theme: "light" | "dark",
  isCurrent: () => boolean
): Promise<MathFrameResponse> {
  const cancellation = watchCurrent(isCurrent);
  const ready = waitForFrame(frame, "math-frame.ready", cancellation);
  try {
    frame.src = new URL("math-frame.html", document.baseURI).toString();
    await ready.promise;
    if (cancellation.cancelled) throw new Error("Math render superseded by a newer document");

    const channel = new MessageChannel();
    let transferred = false;
    const response = waitForMathResponse(channel, cancellation);
    try {
      const request: MathFrameRequest = { type: "render", expression: placeholder.expression, displayMode: placeholder.displayMode, theme };
      frame.contentWindow?.postMessage(request, "*", [channel.port2]);
      transferred = true;
      return await response.promise;
    } finally {
      response.cancel();
      channel.port1.close();
      if (!transferred) channel.port2.close();
    }
  } finally {
    ready.cancel();
    cancellation.dispose();
  }
}

interface CurrentCancellation {
  readonly cancelled: boolean;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

interface WaitHandle<T> {
  promise: Promise<T>;
  cancel(): void;
}

function watchCurrent(isCurrent: () => boolean): CurrentCancellation {
  let cancelled = !isCurrent();
  const listeners = new Set<() => void>();
  const interval = window.setInterval(() => {
    if (cancelled || isCurrent()) return;
    cancelled = true;
    for (const listener of Array.from(listeners)) listener();
    listeners.clear();
  }, 50);
  return {
    get cancelled() {
      return cancelled;
    },
    subscribe(listener: () => void): () => void {
      if (cancelled) {
        listener();
        return () => {};
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose(): void {
      window.clearInterval(interval);
      listeners.clear();
    }
  };
}

function waitForFrame(frame: HTMLIFrameElement, type: string, cancellation: CurrentCancellation): WaitHandle<void> {
  let cancel = (): void => {};
  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    let unsubscribe = (): void => {};
    const timeout = window.setTimeout(() => settle(() => reject(new Error("Math renderer frame timed out"))), 30_000);
    const listener = (event: MessageEvent<unknown>): void => {
      if (event.source !== frame.contentWindow || !isReadyMessage(event.data, type)) return;
      settle(resolve);
    };
    const onError = (): void => settle(() => reject(new Error("Math renderer frame could not be loaded")));
    const settle = (finish: () => void): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener("message", listener);
      frame.removeEventListener("error", onError);
      unsubscribe();
      finish();
    };
    cancel = (): void => settle(() => reject(new Error("Math render wait cancelled")));
    window.addEventListener("message", listener);
    frame.addEventListener("error", onError);
    unsubscribe = cancellation.subscribe(() => settle(() => reject(new Error("Math render superseded by a newer document"))));
  });
  return { promise, cancel: () => cancel() };
}

function waitForMathResponse(channel: MessageChannel, cancellation: CurrentCancellation): WaitHandle<MathFrameResponse> {
  let cancel = (): void => {};
  const promise = new Promise<MathFrameResponse>((resolve, reject) => {
    let settled = false;
    let unsubscribe = (): void => {};
    const timeout = window.setTimeout(() => settle(() => reject(new Error("Math renderer timed out"))), 30_000);
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (!isMathResponse(event.data)) {
        settle(() => reject(new Error("Math renderer returned an invalid response")));
        return;
      }
      settle(() => resolve(event.data as MathFrameResponse));
    };
    const settle = (finish: () => void): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      channel.port1.removeEventListener("message", onMessage);
      channel.port1.close();
      unsubscribe();
      finish();
    };
    cancel = (): void => settle(() => reject(new Error("Math response wait cancelled")));
    channel.port1.addEventListener("message", onMessage);
    channel.port1.start();
    unsubscribe = cancellation.subscribe(() => settle(() => reject(new Error("Math render superseded by a newer document"))));
  });
  return { promise, cancel: () => cancel() };
}

function isReadyMessage(value: unknown, type: string): boolean {
  return Boolean(value && typeof value === "object" && (value as { type?: unknown }).type === type);
}

function isMathResponse(value: unknown): value is MathFrameResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return typeof response.ok === "boolean" &&
    (response.width === undefined || typeof response.width === "number") &&
    (response.height === undefined || typeof response.height === "number") &&
    (response.message === undefined || typeof response.message === "string");
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, Math.ceil(value))) : minimum;
}
