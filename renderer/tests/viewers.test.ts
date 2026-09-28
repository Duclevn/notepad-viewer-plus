import { describe, expect, it } from "vitest";
import { isPreviewUpdate, type PreviewUpdate, type ViewerSettings } from "../src/bridge/protocol";
import { detectDelimiter, parseDelimited } from "../src/viewers/delimited-viewer";
import { sanitizeOpenApiValue, StructuredDataViewer, validateOpenApiRefs } from "../src/viewers/structured-viewer";
import { ViewerRegistry } from "../src/viewers/registry";
import { sanitizeStandaloneSvg } from "../src/security/sanitize";

const settings: ViewerSettings = {
  showFrontMatter: true,
  showTableOfContents: false,
  rawHtml: true,
  remoteImages: false,
  mathAlternateDelimiters: false,
  codeWrapping: true,
  formatOverride: "auto",
  maximumTextBytes: 5 * 1024 * 1024,
  maximumStructuredBytes: 5 * 1024 * 1024,
  maximumCsvRows: 100,
  maximumCsvColumns: 20,
  maximumCsvCellBytes: 1024,
  maximumResourceBytes: 512 * 1024 * 1024
};

function update(formatHint: PreviewUpdate["formatHint"], text: string): PreviewUpdate {
  return {
    type: "preview.update",
    protocolVersion: 2,
    generation: 1,
    bufferId: 1,
    formatHint,
    file: { name: `fixture${formatHint === "markdown" ? ".md" : `.${formatHint}`}`, extension: `.${formatHint}`, saved: false },
    source: { kind: "text", text },
    theme: "light",
    settings
  };
}

describe("Phase 2 viewers", () => {
  it("dispatches all planned renderer formats through the registry", () => {
    const ids = new ViewerRegistry().adapterIds;
    expect(ids).toEqual(expect.arrayContaining(["markdown", "mermaid", "plantuml", "html", "svg", "json", "csv", "image", "pdf", "plain-text"]));
  });

  it("renders bounded structured trees and keeps malformed input in raw fallback", async () => {
    const viewer = new StructuredDataViewer();
    const root = document.createElement("article");
    await viewer.render({ update: update("json", '{"name":"<script>","items":[1,true]}'), root, isCurrent: () => true });
    expect(root.querySelector(".mpp-structured-viewer")).not.toBeNull();
    expect(root.textContent).toContain("<script>");

    await viewer.render({ update: update("json", '{broken'), root, isCurrent: () => true });
    expect(root.querySelector(".mpp-raw-fallback")).not.toBeNull();
    expect(root.textContent).toContain("{broken");
  });

  it("rejects XML DTDs and remote OpenAPI references", async () => {
    const viewer = new StructuredDataViewer();
    const root = document.createElement("article");
    await viewer.render({ update: update("xml", '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///secret">]><a>&x;</a>'), root, isCurrent: () => true });
    expect(root.querySelector(".mpp-raw-fallback")).not.toBeNull();
    expect(validateOpenApiRefs({ paths: { "/x": { get: { "$ref": "https://evil.test/spec" } } } })).toHaveLength(1);
    expect(validateOpenApiRefs({ paths: { "/x": { get: { "$ref": "#/components/schemas/X" } } } })).toHaveLength(0);
    const safeDescription = sanitizeOpenApiValue('<img src="https://evil.test/x"> ![x](https://evil.test/x) <script>alert(1)</script>');
    expect(safeDescription).not.toMatch(/evil\.test|script|<img/iu);
  });

  it("parses quoted CSV records and virtualizes the rendered rows", () => {
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    const result = parseDelimited('name,notes\n"A","line 1\nline 2"\n', ",", { maxRows: 10, maxColumns: 10, maxCellBytes: 100 });
    expect(result.rows).toEqual([["name", "notes"], ["A", "line 1\nline 2"]]);
  });

  it("sanitizes standalone SVG active content and remote references", () => {
    const svg = sanitizeStandaloneSvg('<svg width="100000" height="10" onload="alert(1)"><script>alert(1)</script><foreignObject>x</foreignObject><image href="https://evil.test/a.png"/><image href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="/><path d="M0 0"/></svg>');
    expect(svg).toContain("<svg");
    expect(svg).not.toMatch(/script|foreignObject|onload|https:\/\/evil|data:image\/svg\+xml/iu);
    expect(svg).toContain('width="10000"');
    const recursive = sanitizeStandaloneSvg('<svg><defs><g id="x"><use href="#x"/></g></defs><use href="#x"/></svg>');
    expect(recursive).not.toMatch(/<use\b/iu);
  });

  it("accepts opaque exact-file resources but rejects path-like tokens", () => {
    const valid = update("image", "");
    valid.source = { kind: "resource", token: "0123456789abcdef", url: "https://doc.local/file/0123456789abcdef", size: 4, mediaType: "image/png" };
    expect(isPreviewUpdate(valid)).toBe(true);
    expect(isPreviewUpdate({ ...valid, source: { ...valid.source, token: "C:/secret" } })).toBe(false);
  });
});
