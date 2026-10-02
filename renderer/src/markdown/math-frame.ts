import katex from "katex";
import "katex/dist/katex.min.css";
import { sanitizeGeneratedMath } from "../security/sanitize";

export {};

interface MathRequest {
  type: "render";
  expression: string;
  displayMode: boolean;
  theme: "light" | "dark";
}

export interface MathContentBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface MathFrameLayout {
  paddingLeft: number;
  paddingTop: number;
  width: number;
  height: number;
}

window.addEventListener("message", async (event: MessageEvent<unknown>) => {
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
    document.documentElement.dataset.theme = event.data.theme;
    document.body.style.paddingLeft = "";
    document.body.style.paddingTop = "";
    document.body.innerHTML = sanitizeGeneratedMath(html);
    const fonts = document.fonts;
    if (fonts) await fonts.ready;
    const rendered = document.querySelector<HTMLElement>(event.data.displayMode ? ".katex-display" : ".katex");
    if (!rendered) throw new Error("KaTeX produced no measurable output");
    const initialBounds = measureMathContentBounds(rendered);
    const initialLayout = calculateMathFrameLayout(initialBounds, 0, 0);
    if (initialLayout.paddingLeft > 0) document.body.style.paddingLeft = `${initialLayout.paddingLeft}px`;
    if (initialLayout.paddingTop > 0) document.body.style.paddingTop = `${initialLayout.paddingTop}px`;
    const bounds = measureMathContentBounds(rendered);
    const style = getComputedStyle(rendered);
    const marginWidth = pixelValue(style.marginLeft) + pixelValue(style.marginRight);
    const marginHeight = pixelValue(style.marginTop) + pixelValue(style.marginBottom);
    const layout = calculateMathFrameLayout(bounds, marginWidth, marginHeight);
    port.postMessage({
      ok: true,
      width: layout.width,
      height: layout.height
    });
  } catch (error) {
    port.postMessage({ ok: false, message: error instanceof Error ? error.message : "Math expression could not be rendered" });
  }
});

window.parent.postMessage({ type: "math-frame.ready" }, "*");

export function measureMathContentBounds(rendered: HTMLElement): MathContentBounds {
  const visual = rendered.querySelector<HTMLElement>(".katex-html") ?? rendered;
  const range = document.createRange();
  range.selectNodeContents(visual);
  const rectangles: MathContentBounds[] = [toMathContentBounds(visual.getBoundingClientRect()), toMathContentBounds(range.getBoundingClientRect())];
  for (const svg of visual.querySelectorAll<SVGElement>("svg")) rectangles.push(toMathContentBounds(svg.getBoundingClientRect()));
  return rectangles.reduce(unionMathContentBounds);
}

export function calculateMathFrameLayout(bounds: MathContentBounds, marginWidth: number, marginHeight: number): MathFrameLayout {
  const paddingLeft = Math.max(0, Math.ceil(-bounds.left));
  const paddingTop = Math.max(0, Math.ceil(-bounds.top));
  return {
    paddingLeft,
    paddingTop,
    width: Math.ceil(Math.max(0, bounds.right - bounds.left) + marginWidth + 2),
    height: Math.ceil(Math.max(0, bounds.bottom - bounds.top) + marginHeight + 2)
  };
}

function toMathContentBounds(rect: Pick<DOMRectReadOnly, "left" | "top" | "right" | "bottom">): MathContentBounds {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function unionMathContentBounds(first: MathContentBounds, next: MathContentBounds): MathContentBounds {
  return {
    left: Math.min(first.left, next.left),
    top: Math.min(first.top, next.top),
    right: Math.max(first.right, next.right),
    bottom: Math.max(first.bottom, next.bottom)
  };
}

function pixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isMathRequest(value: unknown): value is MathRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return request.type === "render" && typeof request.expression === "string" && request.expression.length <= 8192 &&
    typeof request.displayMode === "boolean" && (request.theme === "light" || request.theme === "dark");
}
