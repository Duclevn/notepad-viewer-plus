import {
  isPreviewUpdate,
  makeReadyMessage,
  type DocumentUpdate,
  type RendererMessage
} from "./protocol";

interface WebViewMessageEvent extends Event {
  data: unknown;
}

interface WebViewBridge {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: WebViewMessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: WebViewMessageEvent) => void): void;
}

declare global {
  interface Window {
    chrome?: { webview?: WebViewBridge };
  }
}

export type HostUpdateHandler = (update: DocumentUpdate) => void;

/**
 * Thin boundary around WebView2 messaging. The renderer never interpolates
 * host data into script and accepts only schema-checked document updates.
 */
export class RendererBridge {
  private readonly webview: WebViewBridge | undefined;
  private readonly onMessage = (event: WebViewMessageEvent): void => {
    if (isPreviewUpdate(event.data)) {
      for (const handler of this.handlers) handler(event.data);
    }
  };
  private readonly handlers = new Set<HostUpdateHandler>();

  public constructor(targetWindow: Window = window) {
    this.webview = targetWindow.chrome?.webview;
  }

  public start(): void {
    this.webview?.addEventListener("message", this.onMessage);
    this.post(makeReadyMessage());
  }

  public stop(): void {
    this.webview?.removeEventListener("message", this.onMessage);
    this.handlers.clear();
  }

  public subscribe(handler: HostUpdateHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  public post(message: RendererMessage): void {
    this.webview?.postMessage(message);
  }
}

export class GenerationGate {
  private current = -1;

  public accept(generation: number): boolean {
    if (!Number.isSafeInteger(generation) || generation < this.current) return false;
    this.current = generation;
    return true;
  }

  public isCurrent(generation: number): boolean {
    return generation === this.current;
  }

  public get value(): number {
    return this.current;
  }
}
