import katex from "katex";
import { describe, expect, it } from "vitest";
import { calculateMathFrameLayout } from "../src/markdown/math-frame";
import { sanitizeGeneratedMath } from "../src/security/sanitize";

function renderMath(expression: string, displayMode: boolean): HTMLElement {
  const html = katex.renderToString(expression, {
    displayMode,
    throwOnError: false,
    trust: false,
    maxExpand: 1000,
    strict: "ignore"
  });
  const root = document.createElement("div");
  root.innerHTML = sanitizeGeneratedMath(html);
  return root;
}

describe("generated KaTeX geometry", () => {
  it("keeps radical SVG paths for inline and display roots", () => {
    for (const displayMode of [false, true]) {
      const root = renderMath(String.raw`\sqrt{x^2 + y^2}`, displayMode);
      const rendered = root.querySelector(displayMode ? ".katex-display" : ".katex");
      const svg = rendered?.querySelector("svg");
      const path = svg?.querySelector("path");

      expect(rendered).not.toBeNull();
      expect(root.querySelector(".katex-error")).toBeNull();
      expect(svg).not.toBeNull();
      expect(path?.getAttribute("d")).toMatch(/^M/u);
      expect(svg?.getAttribute("viewBox")).toMatch(/^0 0 /u);
      expect(svg?.getAttribute("preserveAspectRatio")).toBe("xMinYMin slice");
    }
  });

  it("keeps other generated stretchies and MathML roots", () => {
    const overbrace = renderMath(String.raw`\overbrace{a+b}^{n}`, false);
    expect(overbrace.querySelectorAll("svg path").length).toBeGreaterThan(0);

    const vector = renderMath(String.raw`\vec{x}`, false);
    const vectorSvg = vector.querySelector("svg");
    expect(vectorSvg?.querySelector("path")).not.toBeNull();
    expect(vectorSvg?.getAttribute("style")).toContain("width");

    const fraction = renderMath(String.raw`\frac{a}{b}`, false);
    expect(fraction.querySelector(".katex")).not.toBeNull();
    expect(fraction.querySelector("mfrac")).not.toBeNull();

    const displayedIntegral = renderMath(String.raw`\int_0^1 x^2 \mathrm{d}x`, true);
    expect(displayedIntegral.querySelector(".katex-display")).not.toBeNull();
    expect(displayedIntegral.querySelector("msubsup")).not.toBeNull();
    for (const root of [overbrace, vector, fraction, displayedIntegral]) {
      expect(root.querySelector(".katex-error")).toBeNull();
    }
  });

  it("keeps math geometry while rejecting active SVG content and unsafe styles", () => {
    const sanitized = sanitizeGeneratedMath([
      '<span class="katex">',
      '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 10 10" preserveAspectRatio="xMinYMin slice" onload="alert(1)" style="width:1em;background:url(https://evil.test/a)">',
      '<path d="M0 0L10 10" onclick="alert(2)" href="javascript:alert(3)" xlink:href="https://evil.test/path"/>',
      '<foreignObject><img src="https://evil.test/image.png"/></foreignObject>',
      '<script>alert(4)</script>',
      '</svg><style>.bad{display:none}</style></span>'
    ].join(""));

    const root = document.createElement("div");
    root.innerHTML = sanitized;
    const svg = root.querySelector("svg");

    expect(svg?.querySelector("path")?.getAttribute("d")).toBe("M0 0L10 10");
    expect(svg?.getAttribute("style")).toBe("width: 1em");
    expect(root.querySelector("script, style, foreignObject, img")).toBeNull();
    expect(root.querySelector("[onload], [onclick], [href], [src]")).toBeNull();
    expect(sanitized).not.toMatch(/javascript:|https:\/\/evil\.test|background|display:none/iu);
  });

  it("sizes out-of-flow overbrace content beyond the root KaTeX bounds", () => {
    const layout = calculateMathFrameLayout({
      left: 0,
      top: -2.59375,
      right: 77.8984375,
      bottom: 47.125
    }, 0, 0);

    expect(layout).toEqual({ paddingLeft: 0, paddingTop: 3, width: 80, height: 52 });
  });
});
