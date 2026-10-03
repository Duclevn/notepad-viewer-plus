import { afterEach, describe, expect, it, vi } from "vitest";
import { DiagramRenderer } from "../src/diagrams/diagrams";
import { renderMathPlaceholders, type MathPlaceholder } from "../src/markdown/math";
import { MAX_MARKDOWN_SOURCE_BYTES } from "../src/performance/limits";
import {
  createOwnedObjectUrl,
  ownedObjectUrlCount,
  releaseAllOwnedObjectUrls,
  releaseOwnedObjectUrls,
  trackOwnedObjectUrl
} from "../src/object-urls";
import { MarkdownViewer } from "../src/viewers/markdown-viewer";
import { ViewerRegistry } from "../src/viewers/registry";
import type { PreviewUpdate, ViewerSettings } from "../src/bridge/protocol";

const settings: ViewerSettings = {
  showFrontMatter: true,
  showTableOfContents: false,
  rawHtml: true,
  remoteImages: false,
  mathAlternateDelimiters: true,
  codeWrapping: true,
  formatOverride: "auto",
  maximumTextBytes: 5 * 1024 * 1024,
  maximumStructuredBytes: 5 * 1024 * 1024,
  maximumCsvRows: 100,
  maximumCsvColumns: 20,
  maximumCsvCellBytes: 1024,
  maximumResourceBytes: 512 * 1024 * 1024
};

function markdownUpdate(source: string): PreviewUpdate {
  return {
    type: "preview.update",
    protocolVersion: 2,
    generation: 1,
    bufferId: 1,
    formatHint: "markdown",
    file: { name: "limits.md", extension: ".md", saved: false },
    source: { kind: "text", text: source },
    theme: "light",
    settings
  };
}

afterEach(() => {
  vi.useRealTimers();
  releaseAllOwnedObjectUrls();
});

describe("renderer lifecycle boundaries", () => {
  it("releases each owned object URL exactly once across root replacement and disposal", () => {
    let sequence = 0;
    const create = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:https://app.local/${++sequence}`);
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const root = document.createElement("article");
    const owner = document.createElement("section");
    const first = createOwnedObjectUrl(new Blob(["first"], { type: "text/plain" }));
    const second = createOwnedObjectUrl(new Blob(["second"], { type: "text/plain" }));
    trackOwnedObjectUrl(owner, first);
    root.appendChild(owner);

    expect(ownedObjectUrlCount()).toBe(2);
    releaseOwnedObjectUrls(root);
    releaseOwnedObjectUrls(root);
    expect(revoke).toHaveBeenCalledWith(first);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(ownedObjectUrlCount()).toBe(1);

    releaseAllOwnedObjectUrls();
    releaseAllOwnedObjectUrls();
    expect(revoke).toHaveBeenCalledWith(second);
    expect(revoke).toHaveBeenCalledTimes(2);
    create.mockRestore();
    revoke.mockRestore();
  });

  it("releases an SVG resource when the registry switches to a text viewer", async () => {
    let sequence = 0;
    const create = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:https://app.local/transition-${++sequence}`);
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const registry = new ViewerRegistry();
    const root = document.createElement("article");
    const svg = markdownUpdate("<svg viewBox=\"0 0 1 1\"><path d=\"M0 0\"/></svg>");
    svg.formatHint = "svg";
    svg.file = { name: "transition.svg", extension: ".svg", saved: false };
    const plain = markdownUpdate("after transition");
    plain.formatHint = "plain-text";
    plain.file = { name: "transition.txt", extension: ".txt", saved: false };

    await registry.render({ update: svg, effectiveTheme: "light", root, isCurrent: () => true });
    expect(root.querySelector(".mpp-svg-viewer")).not.toBeNull();
    expect(ownedObjectUrlCount()).toBe(1);
    await registry.render({ update: plain, effectiveTheme: "light", root, isCurrent: () => true });

    expect(root.querySelector(".mpp-plain-text-viewer")).not.toBeNull();
    expect(ownedObjectUrlCount()).toBe(0);
    expect(revoke).toHaveBeenCalledTimes(1);
    registry.dispose(root);
    create.mockRestore();
    revoke.mockRestore();
  });

  it("keeps a Markdown fallback readable as plain source and reports its reason", async () => {
    const source = "source remains readable\n" + "x".repeat(MAX_MARKDOWN_SOURCE_BYTES + 1);
    const root = document.createElement("article");
    const viewer = new MarkdownViewer(new DiagramRenderer());

    const result = await viewer.render({
      update: markdownUpdate(source),
      effectiveTheme: "light",
      root,
      isCurrent: () => true
    });

    expect(root.querySelector(".mpp-raw-fallback")?.textContent).toBe(source);
    expect(result.warnings?.[0]).toContain("1 MiB");
  });

  it("cleans math readiness listeners on timeout and generation cancellation", async () => {
    vi.useFakeTimers();
    const addMessage = vi.spyOn(window, "addEventListener");
    const removeMessage = vi.spyOn(window, "removeEventListener");
    const root = document.createElement("article");
    const placeholder: MathPlaceholder = { id: "math-timeout", expression: "x", displayMode: false };
    root.innerHTML = '<span data-mpp-math="math-timeout"></span>';

    const timeoutRender = renderMathPlaceholders(root, [placeholder], "light");
    await vi.advanceTimersByTimeAsync(30_001);
    await timeoutRender;
    expect(root.querySelector(".mpp-inline-error")?.textContent).toContain("timed out");

    const timeoutAdds = addMessage.mock.calls.filter(([type]) => type === "message").length;
    const timeoutRemoves = removeMessage.mock.calls.filter(([type]) => type === "message").length;
    expect(timeoutAdds).toBe(timeoutRemoves);

    let current = true;
    root.innerHTML = '<span data-mpp-math="math-cancel"></span>';
    const cancelled: MathPlaceholder = { id: "math-cancel", expression: "x", displayMode: false };
    const cancellationRender = renderMathPlaceholders(root, [cancelled], "light", () => current);
    current = false;
    await vi.advanceTimersByTimeAsync(100);
    await cancellationRender;
    expect(root.querySelector("iframe")).toBeNull();

    const cancelAdds = addMessage.mock.calls.filter(([type]) => type === "message").length;
    const cancelRemoves = removeMessage.mock.calls.filter(([type]) => type === "message").length;
    expect(cancelAdds).toBe(cancelRemoves);
    addMessage.mockRestore();
    removeMessage.mockRestore();
  });

  it("reuses one diagram realm across changed sources and rejects stale results", async () => {
    const renderer = new DiagramRenderer();
    const root = document.createElement("article");
    let currentGeneration = 1;
    let requestCount = 0;
    let stalePort: MessagePort | undefined;

    const render = (generation: number, source: string): Promise<void> => {
      root.innerHTML = `<section data-mpp-diagram="diagram-${generation}"></section>`;
      return renderer.renderAll(root, [{ id: `diagram-${generation}`, engine: "mermaid", source }], {
        theme: "light",
        generation,
        isCurrent: () => generation === currentGeneration
      });
    };

    const first = render(1, "A --> B");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    const frame = document.querySelector<HTMLIFrameElement>(".mpp-diagram-frame");
    expect(frame).not.toBeNull();
    const frameWindow = frame?.contentWindow;
    expect(frameWindow).not.toBeNull();
    const postMessage = vi.spyOn(frameWindow!, "postMessage").mockImplementation((_message: unknown, _options?: WindowPostMessageOptions, transfer?: Transferable[]) => {
      const port = transfer?.[0] as MessagePort | undefined;
      requestCount += 1;
      if (requestCount === 1) {
        stalePort = port;
      } else {
        port?.postMessage({ ok: true, svg: "<svg><path d='M1 1'/></svg>" });
      }
    });
    const readyEvent = new Event("message") as MessageEvent<unknown>;
    Object.defineProperties(readyEvent, {
      source: { value: frameWindow },
      data: { value: { type: "diagram-frame.ready" } }
    });
    window.dispatchEvent(readyEvent);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

    currentGeneration = 2;
    const second = render(2, "C --> D");
    await second;
    await first;

    expect(requestCount).toBe(2);
    expect(document.querySelectorAll(".mpp-diagram-frame")).toHaveLength(1);
    expect(root.querySelector("[data-mpp-diagram='diagram-2'] img")).not.toBeNull();
    expect(root.querySelector("[data-mpp-diagram='diagram-1']")).toBeNull();
    stalePort?.postMessage({ ok: true, svg: "<svg><path d='M0 0'/></svg>" });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    expect(root.querySelector("[data-mpp-diagram='diagram-2'] img")).not.toBeNull();
    expect(ownedObjectUrlCount()).toBe(1);
    releaseOwnedObjectUrls(root);
    expect(ownedObjectUrlCount()).toBe(0);
    postMessage.mockRestore();
    renderer.dispose();
  });

  it("replaces a timed-out diagram frame before rendering the next diagram", async () => {
    vi.useFakeTimers();
    let sequence = 0;
    const create = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:https://app.local/timeout-${++sequence}`);
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const renderer = new DiagramRenderer();
    const root = document.createElement("article");
    let currentGeneration = 1;
    const flushMicrotasks = async (): Promise<void> => {
      await Promise.resolve();
      await Promise.resolve();
    };
    const firstPlaceholder = { id: "diagram-timeout", engine: "mermaid" as const, source: "A --> B" };
    root.innerHTML = `<section data-mpp-diagram="${firstPlaceholder.id}"></section>`;

    const firstRender = renderer.renderAll(root, [firstPlaceholder], {
      theme: "light",
      generation: 1,
      isCurrent: () => currentGeneration === 1
    });
    await flushMicrotasks();
    const firstFrame = document.querySelector<HTMLIFrameElement>(".mpp-diagram-frame");
    expect(firstFrame).not.toBeNull();
    const firstWindow = firstFrame?.contentWindow;
    expect(firstWindow).not.toBeNull();
    const firstPostMessage = vi.spyOn(firstWindow!, "postMessage").mockImplementation(() => {});
    const firstReady = new Event("message") as MessageEvent<unknown>;
    Object.defineProperties(firstReady, {
      source: { value: firstWindow },
      data: { value: { type: "diagram-frame.ready" } }
    });
    window.dispatchEvent(firstReady);
    await flushMicrotasks();
    expect(firstPostMessage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    await firstRender;
    expect(firstFrame?.isConnected).toBe(false);
    expect(document.querySelector(".mpp-diagram-frame")).toBeNull();

    currentGeneration = 2;
    const secondPlaceholder = { id: "diagram-next", engine: "mermaid" as const, source: "C --> D" };
    root.innerHTML = `<section data-mpp-diagram="${secondPlaceholder.id}"></section>`;
    const secondRender = renderer.renderAll(root, [secondPlaceholder], {
      theme: "light",
      generation: 2,
      isCurrent: () => currentGeneration === 2
    });
    await flushMicrotasks();
    const secondFrame = document.querySelector<HTMLIFrameElement>(".mpp-diagram-frame");
    expect(secondFrame).not.toBeNull();
    expect(secondFrame).not.toBe(firstFrame);
    const secondWindow = secondFrame?.contentWindow;
    expect(secondWindow).not.toBeNull();
    const secondPostMessage = vi.spyOn(secondWindow!, "postMessage").mockImplementation((_message: unknown, _options?: WindowPostMessageOptions, transfer?: Transferable[]) => {
      (transfer?.[0] as MessagePort | undefined)?.postMessage({ ok: true, svg: "<svg><path d='M1 1'/></svg>" });
    });
    const secondReady = new Event("message") as MessageEvent<unknown>;
    Object.defineProperties(secondReady, {
      source: { value: secondWindow },
      data: { value: { type: "diagram-frame.ready" } }
    });
    window.dispatchEvent(secondReady);
    await secondRender;

    expect(secondPostMessage).toHaveBeenCalledTimes(1);
    expect(root.querySelector(".mpp-diagram-image")).not.toBeNull();
    expect(ownedObjectUrlCount()).toBe(1);
    releaseOwnedObjectUrls(root);
    expect(ownedObjectUrlCount()).toBe(0);
    expect(revoke).toHaveBeenCalledTimes(1);

    firstPostMessage.mockRestore();
    secondPostMessage.mockRestore();
    create.mockRestore();
    revoke.mockRestore();
    renderer.dispose();
  });
});
