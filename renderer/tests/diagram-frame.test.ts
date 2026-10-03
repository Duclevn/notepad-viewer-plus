import { describe, expect, it, vi } from "vitest";

interface MermaidResponse {
  svg: string;
}

function dispatchFrameRequest(request: unknown, port: MessagePort): void {
  const event = new Event("message") as MessageEvent<unknown>;
  Object.defineProperties(event, {
    source: { value: window },
    data: { value: request },
    ports: { value: [port] }
  });
  window.dispatchEvent(event);
}

async function settleMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("diagram sandbox serialization", () => {
  it("runs one engine job at a time and coalesces pending generations", async () => {
    vi.resetModules();
    const previousMermaid = globalThis.mermaid;
    let active = 0;
    let maximumActive = 0;
    const pending: Array<(response: MermaidResponse) => void> = [];
    const mermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => new Promise<MermaidResponse>((resolve) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        pending.push((response) => {
          active -= 1;
          resolve(response);
        });
      }))
    };
    globalThis.mermaid = mermaid;

    await import("../src/diagrams/frame");
    const first = new MessageChannel();
    const second = new MessageChannel();
    const latest = new MessageChannel();
    const secondClose = vi.spyOn(second.port2, "close");
    const requests = (id: string) => ({
      type: "render",
      id,
      engine: "mermaid",
      source: `${id} --> next`,
      theme: "light"
    });

    dispatchFrameRequest(requests("first"), first.port2);
    await settleMicrotasks();
    expect(pending).toHaveLength(1);

    dispatchFrameRequest(requests("second"), second.port2);
    dispatchFrameRequest(requests("latest"), latest.port2);
    await settleMicrotasks();
    expect(pending).toHaveLength(1);
    expect(secondClose).toHaveBeenCalledTimes(1);
    expect(maximumActive).toBe(1);

    const firstResponse = vi.fn();
    first.port1.onmessage = firstResponse;
    pending.shift()?.({ svg: "<svg><path d='M0 0'/></svg>" });
    await settleMicrotasks();
    expect(pending).toHaveLength(1);
    expect(maximumActive).toBe(1);

    const latestResponse = vi.fn();
    latest.port1.onmessage = latestResponse;
    pending.shift()?.({ svg: "<svg><path d='M1 1'/></svg>" });
    await settleMicrotasks();

    expect(maximumActive).toBe(1);
    expect(mermaid.initialize).toHaveBeenCalledTimes(1);
    expect(firstResponse).toHaveBeenCalledTimes(1);
    expect(latestResponse).toHaveBeenCalledTimes(1);
    expect(second.port1.onmessage).toBeNull();

    first.port1.close();
    first.port2.close();
    second.port1.close();
    latest.port1.close();
    latest.port2.close();
    globalThis.mermaid = previousMermaid;
  });
});
