import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isPreviewUpdate, type PreviewUpdate, type ViewerFormat, type ViewerSettings } from "../src/bridge/protocol";
import { DiagramRenderer } from "../src/diagrams/diagrams";
import { MarkdownPipeline } from "../src/markdown/pipeline";
import { sanitizeStandaloneSvg } from "../src/security/sanitize";
import { DelimitedViewer, parseDelimited } from "../src/viewers/delimited-viewer";
import { HtmlViewer } from "../src/viewers/html-viewer";
import { ImageViewer, PdfViewer } from "../src/viewers/binary-viewers";
import { MarkdownViewer } from "../src/viewers/markdown-viewer";
import { ViewerRegistry } from "../src/viewers/registry";
import { parseStructured, sanitizeOpenApiValue, StructuredDataViewer, validateOpenApiRefs } from "../src/viewers/structured-viewer";
import { PlainTextViewer } from "../src/viewers/plain-text-viewer";
import { SvgViewer } from "../src/viewers/svg-viewer";
import type { ViewerContext } from "../src/viewers/types";

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../test-fixtures/viewer-matrix");

const baseSettings: ViewerSettings = {
  showFrontMatter: true,
  showTableOfContents: true,
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

function fixtureText(relativePath: string): string {
  return readFileSync(resolve(fixtureRoot, relativePath), "utf8");
}

function fixtureBytes(relativePath: string): Buffer {
  return readFileSync(resolve(fixtureRoot, relativePath));
}

function makeUpdate(
  formatHint: ViewerFormat,
  fileName: string,
  text: string,
  settings: Partial<ViewerSettings> = {}
): PreviewUpdate {
  return {
    type: "preview.update",
    protocolVersion: 2,
    generation: 1,
    bufferId: 11,
    formatHint,
    file: { name: fileName, extension: extname(fileName), saved: false },
    source: { kind: "text", text },
    theme: "light",
    settings: { ...baseSettings, ...settings }
  };
}

function makeResourceUpdate(
  formatHint: "image" | "pdf",
  fileName: string,
  size: number,
  mediaType = formatHint === "pdf" ? "application/pdf" : "image/png"
): PreviewUpdate {
  const token = `matrix-${formatHint}-token`;
  return {
    ...makeUpdate(formatHint, fileName, ""),
    file: { name: fileName, extension: extname(fileName), saved: true },
    source: {
      kind: "resource",
      token,
      url: `https://doc.local/file/${token}`,
      size,
      mediaType
    }
  };
}

function context(update: PreviewUpdate, root = document.createElement("article")): ViewerContext {
  return {
    update,
    effectiveTheme: "light",
    root,
    directoryToken: "matrix-directory-token",
    isCurrent: () => true
  };
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

describe("viewer fixture matrix", () => {
  it("dispatches every supported text format from real fixture files", () => {
    const cases: Array<{ hint: ViewerFormat; file: string; expected: string; settings?: Partial<ViewerSettings> }> = [
      { hint: "markdown", file: "markdown/normal.md", expected: "markdown" },
      { hint: "html", file: "html/normal.html", expected: "html" },
      { hint: "svg", file: "svg/normal.svg", expected: "svg" },
      { hint: "json", file: "json/normal.json", expected: "json" },
      { hint: "yaml", file: "yaml/normal.yaml", expected: "json" },
      { hint: "xml", file: "xml/normal.xml", expected: "json" },
      { hint: "csv", file: "csv/normal.csv", expected: "csv" },
      { hint: "tsv", file: "tsv/normal.tsv", expected: "csv" },
      { hint: "mermaid", file: "mermaid/normal.mmd", expected: "mermaid" },
      { hint: "plantuml", file: "plantuml/normal.puml", expected: "plantuml" },
      { hint: "json", file: "openapi/normal.json", expected: "json", settings: { formatOverride: "openapi" } },
      { hint: "plain-text", file: "plain-text/normal.txt", expected: "plain-text" }
    ];
    const registry = new ViewerRegistry();

    for (const fixture of cases) {
      const source = fixtureText(fixture.file);
      const update = makeUpdate(fixture.hint, fixture.file.split("/").at(-1) ?? fixture.file, source, fixture.settings);
      expect(source.length, fixture.file).toBeGreaterThan(0);
      expect(registry.resolve(context(update)).id, fixture.file).toBe(fixture.expected);
    }

    registry.dispose();
  });

  it("renders normal Markdown, HTML, SVG, structured, delimited, and plain fixtures", async () => {
    const markdownRoot = document.createElement("article");
    const markdown = new MarkdownViewer(new DiagramRenderer());
    await markdown.render(context(makeUpdate("markdown", "normal.md", fixtureText("markdown/normal.md")), markdownRoot));
    expect(markdownRoot.querySelector(".mpp-markdown-shell")).not.toBeNull();
    expect(markdownRoot.textContent).toContain("Viewer matrix ✅");
    expect(markdownRoot.textContent).toContain("Parse front matter");
    markdown.dispose();

    const htmlRoot = document.createElement("article");
    await new HtmlViewer().render(context(makeUpdate("html", "normal.html", fixtureText("html/normal.html")), htmlRoot));
    const htmlFrame = htmlRoot.querySelector<HTMLIFrameElement>(".mpp-html-viewer");
    expect(htmlFrame?.getAttribute("sandbox")).toBe("");
    expect(htmlFrame?.srcdoc).toContain("Offline HTML fixture");
    expect(htmlFrame?.srcdoc).toContain("https://doc.local/resource/matrix-directory-token/images/local.png");

    const svgSource = fixtureText("svg/normal.svg");
    expect(sanitizeStandaloneSvg(svgSource)).toContain("Offline chart");
    const svgRoot = document.createElement("article");
    await new SvgViewer().render(context(makeUpdate("svg", "normal.svg", svgSource), svgRoot));
    expect(svgRoot.querySelector(".mpp-artboard")).not.toBeNull();
    expect(svgRoot.querySelector(".mpp-svg-viewer")).not.toBeNull();

    const structured = new StructuredDataViewer();
    for (const item of [
      ["json", "normal.json", "json"],
      ["yaml", "normal.yaml", "yaml"],
      ["xml", "normal.xml", "xml"]
    ] as const) {
      const [hint, file, parseFormat] = item;
      const parsed = await parseStructured(fixtureText(`${hint}/${file}`), parseFormat);
      expect(parsed.error, `${hint} parse`).toBeUndefined();
      expect(parsed.value, `${hint} value`).toBeDefined();
      const root = document.createElement("article");
      await structured.render(context(makeUpdate(hint, file, fixtureText(`${hint}/${file}`)), root));
      expect(root.querySelector(".mpp-structured-viewer"), `${hint} render`).not.toBeNull();
    }

    for (const item of [
      ["csv", "normal.csv"],
      ["tsv", "normal.tsv"]
    ] as const) {
      const [hint, file] = item;
      const root = document.createElement("article");
      await new DelimitedViewer().render(context(makeUpdate(hint, file, fixtureText(`${hint}/${file}`)), root));
      expect(root.querySelector(".mpp-delimited-viewer"), `${hint} render`).not.toBeNull();
      expect(root.querySelector("tbody tr"), `${hint} rows`).not.toBeNull();
    }

    const plainRoot = document.createElement("article");
    const plainSource = fixtureText("plain-text/normal.txt");
    await new PlainTextViewer().render(context(makeUpdate("plain-text", "normal.txt", plainSource), plainRoot));
    expect(plainRoot.querySelector("pre")?.textContent).toBe(plainSource);
  });

  it("keeps hostile Markdown and HTML in their safe display boundaries", async () => {
    const markdownRoot = document.createElement("article");
    await new MarkdownViewer(new DiagramRenderer()).render(
      context(makeUpdate("markdown", "security.md", fixtureText("markdown/security.md")), markdownRoot)
    );
    expect(markdownRoot.innerHTML).not.toMatch(/<script\b|javascript:/iu);
    expect(markdownRoot.querySelector("img")?.getAttribute("src")).toBeNull();

    const htmlRoot = document.createElement("article");
    await new HtmlViewer().render(context(makeUpdate("html", "security.html", fixtureText("html/security.html")), htmlRoot));
    const srcdoc = htmlRoot.querySelector<HTMLIFrameElement>("iframe")?.srcdoc ?? "";
    expect(srcdoc).not.toMatch(/<script\b|<style\b|<iframe\b|<form\b|javascript:|example\.invalid/iu);
  });

  it("keeps the Markdown body renderable when front matter is malformed", async () => {
    const source = fixtureText("markdown/malformed-front-matter.md");
    const result = await new MarkdownPipeline().render(makeUpdate("markdown", "malformed-front-matter.md", source));
    expect(result.html).toContain("Front matter could not be parsed");
    expect(result.html).toContain("Still rendered");
  });

  it("captures every expression in the Markdown math geometry regression fixture", async () => {
    const source = fixtureText("markdown/math-regression.md");
    const result = await new MarkdownPipeline().render(makeUpdate("markdown", "math-regression.md", source));
    const expressions = result.math.map(({ expression }) => expression.trim());
    expect(expressions).toContain(String.raw`\sqrt{x^2 + y^2}`);
    expect(expressions).toContain(String.raw`\overbrace{a+b+c}^{\text{grouped terms}}`);
    expect(expressions).toContain(String.raw`\vec{v}`);
    expect(expressions).toContain(String.raw`\frac{1}{2} \qquad \int_0^1 x^2\,dx`);
    expect(expressions).toContain(String.raw`\htmlClass{unsafe}{x}`);
    expect(result.math.filter(({ displayMode }) => displayMode)).toHaveLength(2);
    expect(result.html).toContain("This paragraph follows the invalid formula and must remain readable.");
  });

  it("sanitizes hostile and malformed standalone SVG fixtures", () => {
    const hostile = sanitizeStandaloneSvg(fixtureText("svg/security.svg"));
    expect(hostile).not.toMatch(/script|foreignObject|example\.invalid|data:image\/svg/iu);
    const width = Number.parseFloat(hostile.match(/\bwidth="([0-9.]+)"/u)?.[1] ?? "0");
    expect(width).toBeLessThanOrEqual(10_000);

    expect(() => sanitizeStandaloneSvg(fixtureText("svg/malformed.svg"))).not.toThrow();
    const malformed = sanitizeStandaloneSvg(fixtureText("svg/malformed.svg"));
    expect(malformed).toMatch(/^<svg\b/iu);
  });

  it("uses raw fallbacks for malformed structured data and forbidden XML entities", async () => {
    const viewer = new StructuredDataViewer();
    for (const item of [
      ["json", "malformed.json"],
      ["yaml", "malformed.yaml"],
      ["xml", "malformed.xml"],
      ["xml", "security.xml"]
    ] as const) {
      const [hint, file] = item;
      const root = document.createElement("article");
      await viewer.render(context(makeUpdate(hint, file, fixtureText(`${hint}/${file}`)), root));
      expect(root.querySelector(".mpp-raw-fallback"), `${hint}/${file}`).not.toBeNull();
      expect(root.textContent).toContain(fixtureText(`${hint}/${file}`).trim().slice(0, 12));
    }

    const malformedOpenApi = await parseStructured(fixtureText("openapi/malformed.json"), "json");
    expect(malformedOpenApi.error).toBeDefined();
  });

  it("parses malformed delimited rows without throwing and reports bounds", async () => {
    for (const item of [
      ["csv", "malformed.csv", ","],
      ["tsv", "malformed.tsv", "\t"]
    ] as const) {
      const [, file, delimiter] = item;
      expect(() => parseDelimited(fixtureText(`${item[0]}/${file}`), delimiter, {
        maxRows: 20,
        maxColumns: 10,
        maxCellBytes: 1024
      })).not.toThrow();
    }

    const source = fixtureText("csv/limit.csv");
    const parsed = parseDelimited(source, ",", { maxRows: 3, maxColumns: 2, maxCellBytes: 4 });
    expect(parsed.truncated).toBe(true);
    expect(parsed.rows.length).toBeLessThanOrEqual(3);
    expect(parsed.rows.every((row) => row.length <= 2)).toBe(true);

    const root = document.createElement("article");
    const result = await new DelimitedViewer().render(context(makeUpdate("csv", "limit.csv", source, {
      maximumCsvRows: 3,
      maximumCsvColumns: 2,
      maximumCsvCellBytes: 4
    }), root));
    expect(result.warnings).toContain("Delimited input was truncated at the configured row, column, or cell limit.");
    expect(root.querySelector(".mpp-warning")).not.toBeNull();
  });

  it("bounds structured input before parsing", async () => {
    const root = document.createElement("article");
    const source = fixtureText("json/limit.json");
    await new StructuredDataViewer().render(context(makeUpdate("json", "limit.json", source, {
      maximumStructuredBytes: 32
    }), root));
    expect(root.querySelector(".mpp-raw-fallback")).not.toBeNull();
    expect(root.textContent).toContain("exceeds the configured limit");
    expect(root.querySelector(".mpp-raw-fallback")?.textContent).toBe(source);
  });

  it("handles empty files, primitive structured roots, YAML aliases, and deep YAML", async () => {
    const plainRoot = document.createElement("article");
    await new PlainTextViewer().render(context(makeUpdate("plain-text", "empty.txt", fixtureText("plain-text/empty.txt")), plainRoot));
    expect(plainRoot.querySelector("pre")?.textContent).toBe("");

    const csvRoot = document.createElement("article");
    await new DelimitedViewer().render(context(makeUpdate("csv", "empty.csv", fixtureText("csv/empty.csv")), csvRoot));
    expect(csvRoot.querySelector(".mpp-delimited-info")?.textContent).toContain("0 rows × 0 columns");

    const jsonEmptyRoot = document.createElement("article");
    await new StructuredDataViewer().render(context(makeUpdate("json", "empty.json", fixtureText("json/empty.json")), jsonEmptyRoot));
    expect(jsonEmptyRoot.querySelector(".mpp-raw-fallback")).not.toBeNull();

    const primitiveJson = await parseStructured(fixtureText("json/primitive.json"), "json");
    expect(primitiveJson.error).toBeUndefined();
    expect(primitiveJson.value).toBe(42);
    const primitiveYaml = await parseStructured(fixtureText("yaml/primitive.yaml"), "yaml");
    expect(primitiveYaml.error).toBeUndefined();
    expect(primitiveYaml.value).toBe("true");

    const aliasYaml = await parseStructured(fixtureText("yaml/aliases.yaml"), "yaml");
    expect(aliasYaml.error).toBeUndefined();
    expect(aliasYaml.value).toBeDefined();
    const aliasRoot = document.createElement("article");
    await new StructuredDataViewer().render(context(makeUpdate("yaml", "aliases.yaml", fixtureText("yaml/aliases.yaml")), aliasRoot));
    expect(aliasRoot.textContent).toContain("blue");
    expect(aliasRoot.textContent).toContain("<script> stays text");

    const deepYaml = await parseStructured(fixtureText("yaml/deep.yaml"), "yaml");
    expect(deepYaml.error).toMatch(/exceeds|depth|recursion|stack/iu);
  });

  it("bounds rows, columns, and UTF-8 cell bytes independently", () => {
    const source = fixtureText("csv/unicode-limit.csv");
    const maxRows = 2;
    const maxColumns = 1;
    const maxCellBytes = 8;
    const parsed = parseDelimited(source, ",", { maxRows, maxColumns, maxCellBytes });
    expect(parsed.truncated).toBe(true);
    expect(parsed.rows.length).toBeLessThanOrEqual(maxRows);
    expect(parsed.rows.every((row) => row.length <= maxColumns)).toBe(true);
    expect(new TextEncoder().encode(parsed.rows[1]?.[0] ?? "").byteLength).toBeLessThanOrEqual(maxCellBytes);

    const limits = [0, 1, 2, 3, 4, 7, 8] as const;
    const samples = [
      { label: "ASCII", value: "abcdefgh" },
      { label: "emoji", value: "😀😀😀" }
    ] as const;
    for (const sample of samples) {
      for (const limit of limits) {
        const bounded = parseDelimited(`value\n${sample.value}\n`, ",", {
          maxRows: 2,
          maxColumns: 1,
          maxCellBytes: limit
        }).rows[1]?.[0] ?? "";
        expect(new TextEncoder().encode(bounded).byteLength, `${sample.label} at ${limit}`).toBeLessThanOrEqual(limit);
        expect(hasUnpairedSurrogate(bounded), `${sample.label} at ${limit}`).toBe(false);
        if (new TextEncoder().encode(sample.value).byteLength <= limit) {
          expect(bounded, `${sample.label} exact fit at ${limit}`).toBe(sample.value);
        } else if (limit >= 3) {
          expect(bounded.endsWith("…"), `${sample.label} marker at ${limit}`).toBe(true);
          expect(bounded.codePointAt(bounded.length - 1), `${sample.label} marker code point at ${limit}`).toBe(0x2026);
        } else {
          expect(bounded.endsWith("…"), `${sample.label} no marker at ${limit}`).toBe(false);
        }
      }
    }

    for (const limit of [5, 6]) {
      const exact = parseDelimited("value\n😀x\n", ",", {
        maxRows: 2,
        maxColumns: 1,
        maxCellBytes: limit
      }).rows[1]?.[0] ?? "";
      expect(exact, `emoji + ASCII exact fit at ${limit}`).toBe("😀x");
    }

    const loneSurrogate = parseDelimited("value\nA\ud800B\n", ",", {
      maxRows: 2,
      maxColumns: 1,
      maxCellBytes: 7
    }).rows[1]?.[0] ?? "";
    expect(new TextEncoder().encode(loneSurrogate).byteLength).toBeLessThanOrEqual(7);
  });

  it("accepts local OpenAPI references, rejects remote references, and sanitizes descriptions", async () => {
    const normal = JSON.parse(fixtureText("openapi/normal.json")) as Parameters<typeof sanitizeOpenApiValue>[0];
    expect(validateOpenApiRefs(normal)).toHaveLength(0);
    expect(sanitizeOpenApiValue(normal)).toEqual(normal);

    const remote = JSON.parse(fixtureText("openapi/remote-ref.json")) as Parameters<typeof sanitizeOpenApiValue>[0];
    const invalidRefs = validateOpenApiRefs(remote);
    expect(invalidRefs).toHaveLength(1);
    expect(invalidRefs[0]).toContain("only same-document fragment references are allowed");
    const root = document.createElement("article");
    await new StructuredDataViewer().render(context(makeUpdate("json", "remote-ref.json", fixtureText("openapi/remote-ref.json"), {
      formatOverride: "openapi"
    }), root));
    expect(root.querySelector(".mpp-raw-fallback")).not.toBeNull();
    expect(root.textContent).toContain("OpenAPI references are not allowed");

    const safe = sanitizeOpenApiValue("![remote](https://assets.example.invalid/x.png) <script>alert(1)</script>");
    expect(safe).not.toMatch(/assets\.example\.invalid|script|<img/iu);
  });

  it("routes every declared image media type through exact-file resources", async () => {
    const imageCases = [
      ["chart.png", "image/png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
      ["chart.jpg", "image/jpeg", Buffer.from([255, 216, 255])],
      ["chart.gif", "image/gif", Buffer.from("GIF", "ascii")],
      ["chart.bmp", "image/bmp", Buffer.from("BM", "ascii")],
      ["chart.webp", "image/webp", Buffer.from("RIFF", "ascii")],
      ["chart.ico", "image/x-icon", Buffer.from([0, 0, 1, 0])]
    ] as const;
    const viewer = new ImageViewer();

    for (const [file, mediaType, signature] of imageCases) {
      const bytes = fixtureBytes(`image/${file}`);
      expect(bytes.subarray(0, signature.length), file).toEqual(signature);
      if (mediaType === "image/webp") expect(bytes.subarray(8, 12)).toEqual(Buffer.from("WEBP", "ascii"));
      const update = makeResourceUpdate("image", file, bytes.byteLength, mediaType);
      expect(isPreviewUpdate(update), file).toBe(true);
      const root = document.createElement("article");
      await viewer.render(context(update, root));
      expect(root.querySelector<HTMLImageElement>(".mpp-image-viewer")?.src, file).toBe(update.source.kind === "resource" ? update.source.url : "");
    }

    const transparent = fixtureBytes("image/transparent.png");
    expect(transparent.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(transparent[25]).toBe(6); // RGBA color type in the PNG IHDR chunk.

    const corrupt = fixtureBytes("image/corrupt.png");
    expect(corrupt.subarray(0, 8)).not.toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    // Pillow has no AVIF encoder in this environment. Still exercise the
    // protocol/resource route for the declared media type; browser decoding is manual.
    const avif = makeResourceUpdate("image", "chart.avif", 0, "image/avif");
    expect(isPreviewUpdate(avif)).toBe(true);
    viewer.dispose();
  });

  it("routes valid, multipage, and corrupt PDF fixtures through the exact-file viewer", async () => {
    const pdfCases = [
      ["minimal.pdf", (bytes: Buffer) => bytes.subarray(0, 8).toString("ascii") === "%PDF-1.4"],
      ["multipage.pdf", (bytes: Buffer) => (bytes.toString("ascii").match(/\/Type \/Page\b/gu) ?? []).length >= 2],
      ["corrupt.pdf", (bytes: Buffer) => bytes.subarray(0, 8).toString("ascii") === "%PDF-1.4" && !bytes.includes(Buffer.from("xref", "ascii"))]
    ] as const;
    const viewer = new PdfViewer();

    for (const [file, predicate] of pdfCases) {
      const bytes = fixtureBytes(`pdf/${file}`);
      expect(predicate(bytes), file).toBe(true);
      const update = makeResourceUpdate("pdf", file, bytes.byteLength);
      expect(isPreviewUpdate(update), file).toBe(true);
      const root = document.createElement("article");
      await viewer.render(context(update, root));
      expect(root.querySelector<HTMLIFrameElement>(".mpp-pdf-viewer")?.src, file).toBe(update.source.kind === "resource" ? update.source.url : "");
      expect(root.querySelector("iframe")?.hasAttribute("sandbox"), file).toBe(false);
    }
  });

  it("preserves Unicode and literal markup in plain text and structured values", async () => {
    const plainRoot = document.createElement("article");
    const plainSource = fixtureText("plain-text/security.txt");
    await new PlainTextViewer().render(context(makeUpdate("plain-text", "security.txt", plainSource), plainRoot));
    expect(plainRoot.querySelector("script")).toBeNull();
    expect(plainRoot.querySelector("pre")?.textContent).toBe(plainSource);

    const jsonRoot = document.createElement("article");
    await new StructuredDataViewer().render(context(makeUpdate("json", "normal.json", fixtureText("json/normal.json")), jsonRoot));
    expect(jsonRoot.querySelector("script")).toBeNull();
    expect(jsonRoot.textContent).toContain("<script>must remain text</script>");
    expect(jsonRoot.textContent).toContain("日本語");
  });
});
