import { describe, expect, it } from "vitest";
import { isPreviewUpdate, type PreviewUpdate, type ViewerSettings } from "../src/bridge/protocol";
import { DiagramRenderer } from "../src/diagrams/diagrams";
import { detectDelimiter, parseDelimited } from "../src/viewers/delimited-viewer";
import { HtmlViewer } from "../src/viewers/html-viewer";
import { MarkdownViewer } from "../src/viewers/markdown-viewer";
import { sanitizeOpenApiValue, StructuredDataViewer, validateOpenApiRefs } from "../src/viewers/structured-viewer";
import { getCopyValue } from "../src/viewers/copy-values";
import { ViewerRegistry } from "../src/viewers/registry";
import { sanitizeStandaloneSvg } from "../src/security/sanitize";
import { PdfViewer } from "../src/viewers/binary-viewers";
import { SvgViewer } from "../src/viewers/svg-viewer";

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

  it("leaves PDF frames unsandboxed for the built-in viewer", async () => {
    const viewer = new PdfViewer();
    const root = document.createElement("article");
    const pdf = update("pdf", "");
    pdf.source = {
      kind: "resource",
      token: "0123456789abcdef",
      url: "https://doc.local/file/0123456789abcdef",
      size: 123,
      mediaType: "application/pdf"
    };

    await viewer.render({ update: pdf, effectiveTheme: "light", root, isCurrent: () => true });

    const frame = root.querySelector<HTMLIFrameElement>(".mpp-pdf-viewer");
    expect(frame).not.toBeNull();
    expect(frame?.hasAttribute("sandbox")).toBe(false);
    expect(frame?.referrerPolicy).toBe("no-referrer");
    expect(frame?.src).toBe("https://doc.local/file/0123456789abcdef");
  });

  it("provides an icon-controlled Markdown TOC side panel", async () => {
    const viewer = new MarkdownViewer(new DiagramRenderer());
    const root = document.createElement("article");
    const markdown = update("markdown", "# Overview\n\n## Install");
    const context = { update: markdown, effectiveTheme: "light" as const, root, isCurrent: () => true };

    await viewer.render(context);

    let toggle = root.querySelector<HTMLButtonElement>(".mpp-toc-toggle");
    let panel = root.querySelector<HTMLElement>(".mpp-toc");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.getAttribute("aria-controls")).toBe("mpp-markdown-toc");
    expect(panel?.hidden).toBe(true);
    expect(panel?.querySelector<HTMLAnchorElement>("a")?.getAttribute("href")).toBe("#overview");

    toggle?.click();
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(panel?.hidden).toBe(false);
    expect(root.querySelector(".mpp-markdown-shell")?.classList.contains("mpp-toc-open")).toBe(true);

    await viewer.render(context);
    toggle = root.querySelector<HTMLButtonElement>(".mpp-toc-toggle");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    toggle?.click();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
  });

  it("renders bounded structured trees and keeps malformed input in raw fallback", async () => {
    const viewer = new StructuredDataViewer();
    const root = document.createElement("article");
    await viewer.render({ update: update("json", '{"name":"<script>","items":[1,true]}'), effectiveTheme: "light", root, isCurrent: () => true });
    expect(root.querySelector(".mpp-structured-viewer")).not.toBeNull();
    expect(root.textContent).toContain("<script>");
    expect(root.textContent).not.toContain("[object Object]");

    await viewer.render({ update: update("json", '{broken'), effectiveTheme: "light", root, isCurrent: () => true });
    expect(root.querySelector(".mpp-raw-fallback")).not.toBeNull();
    expect(root.textContent).toContain("{broken");
  });

  it("provides structured tree and code view with badges, search, and toolbar controls", async () => {
    const viewer = new StructuredDataViewer();
    const root = document.createElement("article");
    const testJson = JSON.stringify({
      id: "test-id-123",
      values: [
        { key: "k1", value: "v1" },
        { key: "k2", value: "v2" }
      ]
    });
    await viewer.render({ update: update("json", testJson), effectiveTheme: "dark", root, isCurrent: () => true });

    // Toolbar and badges
    expect(root.querySelector(".mpp-structured-toolbar")).not.toBeNull();
    expect(root.querySelector(".mpp-tree-meta")?.textContent).toContain("JSON");
    expect(root.textContent).not.toContain("[object Object]");

    // Badges present for object/array
    const badges = root.querySelectorAll(".mpp-tree-collapsed-badge");
    expect(badges.length).toBeGreaterThan(0);

    // Copy buttons have valid copy values
    const copyBtns = root.querySelectorAll<HTMLButtonElement>("button[data-mpp-copy-value]");
    expect(copyBtns.length).toBeGreaterThan(0);
    expect(copyBtns[0]?.dataset.mppCopyValue).toBe("");
    expect(getCopyValue(copyBtns[0]!)).toBeDefined();

    // Tab switcher
    const treeTab = root.querySelector<HTMLButtonElement>(".mpp-view-tab[data-mpp-view='tree']");
    const codeTab = root.querySelector<HTMLButtonElement>(".mpp-view-tab[data-mpp-view='code']");
    const treePane = root.querySelector<HTMLElement>(".mpp-structured-tree-pane");
    const codePane = root.querySelector<HTMLElement>(".mpp-structured-code-pane");

    expect(treePane?.hidden).toBe(false);
    expect(codePane?.hidden).toBe(true);
    expect(codePane?.childElementCount).toBe(0);

    codeTab?.click();
    expect(treePane?.hidden).toBe(true);
    expect(codePane?.hidden).toBe(false);
    expect(codePane?.childElementCount).toBe(1);

    treeTab?.click();
    expect(treePane?.hidden).toBe(false);
    expect(codePane?.hidden).toBe(true);

    // Search filter
    const searchInput = root.querySelector<HTMLInputElement>(".mpp-tree-search");
    expect(searchInput).not.toBeNull();
    if (searchInput) {
      searchInput.value = "test-id";
      searchInput.dispatchEvent(new Event("input"));
      const match = root.querySelector(".mpp-match");
      expect(match).not.toBeNull();
    }

    // Expand all / Collapse all
    const expandAllBtn = root.querySelector<HTMLButtonElement>(".mpp-expand-all");
    const collapseAllBtn = root.querySelector<HTMLButtonElement>(".mpp-collapse-all");
    expect(expandAllBtn).not.toBeNull();
    expect(collapseAllBtn).not.toBeNull();

    collapseAllBtn?.click();
    const detailsList = root.querySelectorAll<HTMLDetailsElement>("details.mpp-tree-node");
    expect(detailsList[0]?.open).toBe(true); // root remains open
    if (detailsList.length > 1) {
      expect(detailsList[1]?.open).toBe(false);
    }

    expandAllBtn?.click();
    detailsList.forEach((d) => expect(d.open).toBe(true));

    // Special keys with dots should produce bracket-escaped paths
    await viewer.render({
      update: update("json", JSON.stringify({ "complex.key": "val" })),
      effectiveTheme: "dark",
      root,
      isCurrent: () => true
    });
    const complexCopy = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-mpp-copy-value]"))
      .find((b) => b.title === "Copy JSONPath" && b.getAttribute("aria-label")?.includes("complex.key"));
    expect(complexCopy?.dataset.mppCopyValue).toBe("");
    expect(getCopyValue(complexCopy!)).toBe('$["complex.key"]');
  });

  it("rejects XML DTDs and remote OpenAPI references", async () => {
    const viewer = new StructuredDataViewer();
    const root = document.createElement("article");
    await viewer.render({ update: update("xml", '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///secret">]><a>&x;</a>'), effectiveTheme: "light", root, isCurrent: () => true });
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

  it("keeps arbitrary HTML on an explicit light canvas", async () => {
    const viewer = new HtmlViewer();
    const root = document.createElement("article");
    await viewer.render({ update: update("html", "<h1>Document</h1><style>body{color:red}</style>"), effectiveTheme: "dark", root, isCurrent: () => true });

    const frame = root.querySelector<HTMLIFrameElement>(".mpp-html-viewer");
    expect(frame?.srcdoc).toContain('name="color-scheme" content="light"');
    expect(frame?.srcdoc).toContain('bgcolor="#ffffff" text="#1f2328"');
    expect(frame?.srcdoc).not.toMatch(/<style\b|\sstyle\s*=/iu);
    expect(frame?.srcdoc).not.toContain("color:red");
  });

  it("renders standalone SVG on a user-selectable light artboard", async () => {
    const viewer = new SvgViewer();
    const root = document.createElement("article");
    await viewer.render({ update: update("svg", '<svg viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg>'), effectiveTheme: "dark", root, isCurrent: () => true });

    const artboard = root.querySelector<HTMLElement>(".mpp-artboard");
    expect(artboard?.dataset.mppArtboard).toBe("light");
    root.querySelector<HTMLButtonElement>('[data-mpp-artboard-mode="dark"]')?.click();
    expect(artboard?.dataset.mppArtboard).toBe("dark");
    expect(artboard?.classList.contains("mpp-artboard-dark")).toBe(true);
  });

  it("records each resolved viewer's theme behavior", () => {
    const registry = new ViewerRegistry();
    const root = document.createElement("article");
    const htmlUpdate = update("html", "<p>text</p>");
    expect(registry.resolve({ update: htmlUpdate, effectiveTheme: "dark", root, isCurrent: () => true }).themeBehavior).toBe("light-canvas");
    const xmlUpdate = update("xml", "<root/>");
    expect(registry.resolve({ update: xmlUpdate, effectiveTheme: "dark", root, isCurrent: () => true }).themeBehavior).toBe("native");
    const plantUmlUpdate = update("plantuml", "@startuml\nAlice -> Bob\n@enduml");
    expect(registry.resolve({ update: plantUmlUpdate, effectiveTheme: "dark", root, isCurrent: () => true }).themeBehavior).toBe("theme-aware");
  });

  it("accepts opaque exact-file resources but rejects path-like tokens", () => {
    const valid = update("image", "");
    valid.source = { kind: "resource", token: "0123456789abcdef", url: "https://doc.local/file/0123456789abcdef", size: 4, mediaType: "image/png" };
    expect(isPreviewUpdate(valid)).toBe(true);
    expect(isPreviewUpdate({ ...valid, source: { ...valid.source, token: "C:/secret" } })).toBe(false);
  });
});
