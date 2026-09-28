import katex from "katex";
import "katex/dist/katex.min.css";
import { sanitizeGeneratedMath } from "../security/sanitize";

export {};

interface MathRequest {
  type: "render";
  expression: string;
  displayMode: boolean;
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window.parent || !event.ports[0] || !isMathRequest(event.data)) return;
  const port = event.ports[0];
  try {
    const html = katex.renderToString(event.data.expression, {
      displayMode: event.data.displayMode,
      throwOnError: false,
      trust: false,
      maxExpand: 1000,
      strict: "ignore"
    });
    document.documentElement.dataset.display = String(event.data.displayMode);
    document.body.innerHTML = sanitizeGeneratedMath(html);
    const rendered = document.querySelector<HTMLElement>(event.data.displayMode ? ".katex-display" : ".katex");
    if (!rendered) throw new Error("KaTeX produced no measurable output");
    const bounds = rendered.getBoundingClientRect();
    const style = getComputedStyle(rendered);
    const marginWidth = pixelValue(style.marginLeft) + pixelValue(style.marginRight);
    const marginHeight = pixelValue(style.marginTop) + pixelValue(style.marginBottom);
    port.postMessage({
      ok: true,
      width: Math.ceil(bounds.width + marginWidth + 2),
      height: Math.ceil(bounds.height + marginHeight + 2)
    });
  } catch (error) {
    port.postMessage({ ok: false, message: error instanceof Error ? error.message : "Math expression could not be rendered" });
  }
});

window.parent.postMessage({ type: "math-frame.ready" }, "*");

function pixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isMathRequest(value: unknown): value is MathRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return request.type === "render" && typeof request.expression === "string" && request.expression.length <= 8192 && typeof request.displayMode === "boolean";
}
