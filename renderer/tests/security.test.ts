import { describe, expect, it } from "vitest";
import { GenerationGate } from "../src/bridge/bridge";
import { isSafeRelativePath, makeDocumentResourceUrl, applyResourcePolicy } from "../src/security/resource-policy";
import { sanitizeGeneratedMath, sanitizeHtml, sanitizeSvg } from "../src/security/sanitize";

describe("security policies", () => {
  it("removes executable HTML and unsafe URLs", () => {
    const html = sanitizeHtml(
      '<img src="javascript:alert(1)" onerror="alert(2)"><a href="javascript:alert(3)">x</a><a href="//evil.test/x">network path</a><a href="ftp://evil.test/x">ftp</a><a href="guide.md">guide</a><input type="checkbox" checked disabled><script>alert(4)</script><div style=color:red>bad</div><details><summary>ok</summary>body</details>',
      true
    );

    expect(html).not.toMatch(/javascript:|\/\/evil\.test|ftp:/iu);
    expect(html).not.toMatch(/onerror/iu);
    expect(html).not.toMatch(/<script/iu);
    expect(html).not.toContain("<style");
    expect(html).not.toContain("style=");
    expect(html).toContain('href="guide.md"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain("disabled");
    expect(html).toContain("<details>");
  });

  it("preserves generated SVG geometry while removing executable and external content", () => {
    const svg = sanitizeSvg('<svg viewBox="0 0 100 50"><style>@import "https://evil.test/x";.safe{fill:red;marker-end:url(#arrow)}.bad{fill:url(https://evil.test/a)}.broken{fill:url(https://evil.test/no-close}.legacy{behavior:url(javascript:alert(1))}</style><script>alert(1)</script><foreignObject><img src="https://evil.test/x"></foreignObject><marker id="arrow"><path d="M0 0L5 5"/></marker><path class="safe" visibility="hidden" color="red" shape-rendering="crispEdges" dominant-baseline="middle" alignment-baseline="middle" style="stroke:blue;background:url(https://evil.test/b)" d="M0 0L10 10" marker-end="url(#arrow)"/></svg>');

    expect(svg).toContain("<svg");
    expect(svg).toMatch(/viewBox="0 0 100 50"/u);
    expect(svg).toMatch(/width="100"/u);
    expect(svg).toMatch(/height="50"/u);
    expect(svg).toContain('d="M0 0L10 10"');
    expect(svg).toContain("stroke:blue");
    expect(svg).toContain("url(#arrow)");
    expect(svg).toContain('visibility="hidden"');
    expect(svg).toContain('color="red"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('dominant-baseline="middle"');
    expect(svg).toContain('alignment-baseline="middle"');
    expect(svg).not.toMatch(/script|foreignObject|https:\/\/evil|url\(\/\/|behavior|@import|\)\)/iu);
  });

  it("keeps only layout styles required by generated KaTeX", () => {
    const html = sanitizeGeneratedMath('<span class="katex" style="height:1em;vertical-align:-0.2em;background-image:url(https://evil.test/a)"><span style="margin-right:0.1em;position:fixed">x</span><script>alert(1)</script></span>');

    expect(html).toContain("height: 1em");
    expect(html).toContain("vertical-align: -0.2em");
    expect(html).toContain("margin-right: 0.1em");
    expect(html).not.toMatch(/background|position|url\(|script|evil/iu);
  });

  it("rejects local traversal and rewrites only constrained resources", () => {
    expect(isSafeRelativePath("images/diagram.png")).toBe(true);
    expect(isSafeRelativePath("../secret.txt")).toBe(false);
    expect(isSafeRelativePath("C:/secret.txt")).toBe(false);
    expect(makeDocumentResourceUrl("opaque-session", "images/diagram.png")).toBe("https://doc.local/resource/opaque-session/images/diagram.png");
    expect(makeDocumentResourceUrl("opaque-session", "../secret.txt")).toBeUndefined();
  });

  it("blocks remote images by default and preserves safe local image mapping", () => {
    document.body.innerHTML = '<article><img src="https://example.test/a.png"><img src="images/a.png"></article>';
    const root = document.querySelector("article");
    if (!root) throw new Error("test root missing");
    applyResourcePolicy(root, { documentDirectoryToken: "doc-token", remoteImages: false });

    const images = root.querySelectorAll("img");
    expect(images[0]?.getAttribute("src")).toBeNull();
    expect(images[0]?.dataset.mppBlockedResource).toBe("remote-image");
    expect(images[1]?.getAttribute("src")).toBe("https://doc.local/resource/doc-token/images/a.png");
  });

  it("allows only HTTPS remote images when explicitly enabled", () => {
    document.body.innerHTML = '<article><img src="https://example.test/a.png"><img src="http://example.test/a.png"></article>';
    const root = document.querySelector("article");
    if (!root) throw new Error("test root missing");
    applyResourcePolicy(root, { documentDirectoryToken: "doc-token", remoteImages: true });

    const images = root.querySelectorAll("img");
    expect(images[0]?.getAttribute("src")).toBe("https://example.test/a.png");
    expect(images[1]?.getAttribute("src")).toBeNull();
  });

  it("rejects stale generations", () => {
    const gate = new GenerationGate();
    expect(gate.accept(4)).toBe(true);
    expect(gate.accept(3)).toBe(false);
    expect(gate.isCurrent(4)).toBe(true);
    expect(gate.accept(6)).toBe(true);
    expect(gate.isCurrent(4)).toBe(false);
  });
});
