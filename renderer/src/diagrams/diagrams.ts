import MarkdownIt from "markdown-it";
import { createOwnedObjectUrl, trackOwnedObjectUrl } from "../object-urls";
import { escapeText, sanitizeSvg } from "../security/sanitize";

export type DiagramEngine = "mermaid" | "plantuml";

export interface DiagramPlaceholder {
  id: string;
  engine: DiagramEngine;
  source: string;
}

const CACHE_LIMIT = 32;
const PLANTUML_VERSION = "1.2026.8";
const MERMAID_VERSION = "12.0.0";

class LruCache {
  private readonly entries = new Map<string, string>();

  public get(key: string): string | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  public set(key: string, value: string): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > CACHE_LIMIT) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

export function installDiagramPlugin(md: InstanceType<typeof MarkdownIt>, placeholders: DiagramPlaceholder[], generation: number): void {
  const previousFence = md.renderer.rules.fence;
  let sequence = 0;
  md.renderer.rules.fence = (tokens, index, options, env, self): string => {
    const token = tokens[index];
    const engineName = token?.info.trim().split(/\s+/u)[0]?.toLowerCase();
    const engine: DiagramEngine | undefined = engineName === "mermaid" ? "mermaid" : engineName === "plantuml" || engineName === "puml" ? "plantuml" : undefined;
    if (engine && token) {
      const id = `diagram-${generation}-${sequence++}`;
      placeholders.push({ id, engine, source: token.content });
      return `<section class="mpp-diagram" data-mpp-diagram="${id}" data-mpp-engine="${engine}" aria-live="polite"><div class="mpp-diagram-loading">Rendering ${engine} diagram…</div></section>`;
    }
    return previousFence ? previousFence(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
  };
}

export interface DiagramRenderOptions {
  theme: "light" | "dark";
  generation: number;
  isCurrent: () => boolean;
}

interface FrameRequest {
  type: "render";
  id: string;
  engine: DiagramEngine;
  source: string;
  theme: "light" | "dark";
}

interface FrameResponse {
  ok: boolean;
  svg?: string;
  message?: string;
}

interface DiagramFrame {
  element: HTMLIFrameElement;
  ready: Promise<void>;
  cancel: () => void;
}

export class DiagramRenderer {
  private readonly cache = new LruCache();
  private frame: DiagramFrame | undefined;
  private renderQueue: Promise<void> = Promise.resolve();
  private activeCancel: (() => void) | undefined;
  private lifecycle = 0;

  /** Cancels the current document work while retaining the isolated engine realm. */
  public cancelCurrentUpdate(): void {
    this.activeCancel?.();
    this.activeCancel = undefined;
  }

  /** Fully tears down the renderer, including the isolated engine realm. */
  public dispose(): void {
    this.lifecycle += 1;
    this.cancelCurrentUpdate();
    this.frame?.cancel();
    this.frame = undefined;
    this.renderQueue = Promise.resolve();
  }

  public renderAll(root: ParentNode, placeholders: DiagramPlaceholder[], options: DiagramRenderOptions): Promise<void> {
    this.cancelCurrentUpdate();
    const lifecycle = this.lifecycle;
    const next = this.renderQueue.then(() => {
      if (!options.isCurrent() || lifecycle !== this.lifecycle) return;
      return this.renderAllSerial(root, placeholders, options, lifecycle);
    });
    this.renderQueue = next.catch(() => { /* keep later generations renderable */ });
    return next;
  }

  private async renderAllSerial(root: ParentNode, placeholders: DiagramPlaceholder[], options: DiagramRenderOptions, lifecycle: number): Promise<void> {
    for (const placeholder of placeholders) {
      if (!options.isCurrent() || lifecycle !== this.lifecycle) return;
      const element = root.querySelector<HTMLElement>(`[data-mpp-diagram="${placeholder.id}"]`);
      if (!element) continue;
      try {
        const source = placeholder.source.slice(0, 200_000);
        const version = placeholder.engine === "plantuml" ? PLANTUML_VERSION : MERMAID_VERSION;
        const key = `${placeholder.engine}|${version}|${options.theme}|${source}`;
        let svg = this.cache.get(key);
        if (!svg) {
          svg = await this.renderInSandboxedFrame(placeholder, options);
          this.cache.set(key, svg);
        }
        if (!options.isCurrent() || lifecycle !== this.lifecycle) return;
        this.replaceWithSvgImage(element, svg, `${placeholder.engine} diagram`);
      } catch (error) {
        if (!options.isCurrent() || lifecycle !== this.lifecycle) return;
        const message = error instanceof Error ? error.message : `${placeholder.engine} diagram could not be rendered`;
        element.replaceChildren(this.makeError(message));
        element.classList.add("mpp-diagram-error");
      }
    }
  }

  private async renderInSandboxedFrame(placeholder: DiagramPlaceholder, options: DiagramRenderOptions): Promise<string> {
    let cancelled = false;
    let rejectCancellation: ((reason?: unknown) => void) | undefined;
    let channel: MessageChannel | undefined;
    let transferred = false;
    let timedOut = false;
    let closeResponse = (): void => {};
    const cancellation = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
    });
    const cancel = (): void => {
      if (cancelled) return;
      cancelled = true;
      closeResponse();
      channel?.port1.close();
      rejectCancellation?.(new Error("Diagram render superseded by a newer document"));
    };
    this.activeCancel = cancel;
    try {
      const frame = await Promise.race([this.loadFrame(), cancellation]);
      await Promise.race([frame.ready, cancellation]);
      if (this.frame !== frame || !options.isCurrent()) throw new Error("Diagram render superseded by a newer document");
      channel = new MessageChannel();
      const response = new Promise<FrameResponse>((resolve, reject) => {
        let settled = false;
        const timeout = window.setTimeout(() => {
          timedOut = true;
          finish(() => reject(new Error("Diagram renderer timed out")));
        }, 30_000);
        const finish = (complete: () => void): void => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          channel!.port1.onmessage = null;
          channel!.port1.close();
          complete();
        };
        closeResponse = (): void => finish(() => reject(new Error("Diagram render superseded by a newer document")));
        channel!.port1.onmessage = (event: MessageEvent<unknown>) => {
          if (isFrameResponse(event.data)) finish(() => resolve(event.data as FrameResponse));
          else finish(() => reject(new Error("Diagram renderer returned an invalid response")));
        };
        channel!.port1.start();
      });
      const request: FrameRequest = {
        type: "render",
        id: `${placeholder.id}-${options.generation}`,
        engine: placeholder.engine,
        source: placeholder.source.slice(0, 200_000),
        theme: options.theme
      };
      frame.element.contentWindow?.postMessage(request, "*", [channel.port2]);
      transferred = true;
      const result = await Promise.race([response, cancellation]);
      if (!result.ok || !result.svg) throw new Error(result.message ?? "Diagram renderer failed");
      return result.svg;
    } finally {
      closeResponse();
      if (timedOut && this.frame) this.frame.cancel();
      if (channel) {
        channel.port1.close();
        if (!transferred) channel.port2.close();
      }
      if (this.activeCancel === cancel) this.activeCancel = undefined;
    }
  }

  private loadFrame(): Promise<DiagramFrame> {
    if (this.frame) return Promise.resolve(this.frame);
    const element = document.createElement("iframe");
    element.className = "mpp-diagram-frame";
    element.title = "Diagram renderer";
    element.setAttribute("aria-hidden", "true");
    element.setAttribute("sandbox", "allow-scripts");
    element.src = new URL("diagram-frame.html", document.baseURI).toString();

    let settled = false;
    let cancelled = false;
    let timeout = 0;
    let resolveReady: () => void = () => {};
    let rejectReady: (reason?: unknown) => void = () => {};
    let cleanup = (): void => {};
    const fail = (error: Error): void => {
      if (settled || cancelled) return;
      settled = true;
      cleanup();
      element.remove();
      if (this.frame?.element === element) this.frame = undefined;
      rejectReady(error);
    };
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (event.source !== element.contentWindow || !isReadyMessage(event.data)) return;
      settled = true;
      cleanup();
      resolveReady();
    };
    const onError = (): void => fail(new Error("Diagram renderer frame could not be loaded"));
    const cancel = (): void => {
      if (cancelled) return;
      cancelled = true;
      cleanup();
      if (!settled) {
        settled = true;
        rejectReady(new Error("Diagram renderer frame superseded by a newer document"));
      }
      element.remove();
      if (this.frame?.element === element) this.frame = undefined;
    };
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
      timeout = window.setTimeout(() => fail(new Error("Diagram renderer frame timed out")), 30_000);
      window.addEventListener("message", onMessage);
      element.addEventListener("error", onError);
    });
    cleanup = (): void => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      element.removeEventListener("error", onError);
    };
    document.body.appendChild(element);
    this.frame = { element, ready, cancel };
    return Promise.resolve(this.frame);
  }

  private replaceWithSvgImage(element: HTMLElement, svg: string, alt: string): void {
    const sanitized = sanitizeSvg(svg);
    if (!/^\s*<svg[\s>]/iu.test(sanitized)) throw new Error("Diagram output was not a safe SVG");
    const blob = new Blob([sanitized], { type: "image/svg+xml" });
    const url = createOwnedObjectUrl(blob);
    const image = document.createElement("img");
    image.className = "mpp-diagram-image";
    image.alt = alt;
    image.loading = "lazy";
    image.src = url;
    trackOwnedObjectUrl(element, url);
    element.replaceChildren(image);
  }

  private makeError(message: string): HTMLElement {
    const error = document.createElement("div");
    error.className = "mpp-inline-error";
    error.setAttribute("role", "alert");
    error.innerHTML = `<strong>Diagram error</strong><span>${escapeText(message.slice(0, 1000))}</span>`;
    return error;
  }
}

function isReadyMessage(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as { type?: unknown }).type === "diagram-frame.ready");
}

function isFrameResponse(value: unknown): value is FrameResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return typeof response.ok === "boolean" &&
    (response.svg === undefined || typeof response.svg === "string") &&
    (response.message === undefined || typeof response.message === "string");
}
