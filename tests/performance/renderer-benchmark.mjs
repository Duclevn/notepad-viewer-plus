#!/usr/bin/env node

/*
 * Renderer regression probes.
 *
 * This deliberately uses the production TypeScript modules through Rolldown
 * and jsdom.  It checks bounded work and retained DOM data; elapsed times are
 * reported for context only and are not machine-specific pass/fail criteria.
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { JSDOM } from "../../renderer/node_modules/jsdom/lib/api.js";

const rootDir = resolve(import.meta.dirname, "../..");
const rendererDir = resolve(rootDir, "renderer");
const requireRenderer = createRequire(pathToFileURL(resolve(rendererDir, "package.json")));
const { rolldown } = requireRenderer("rolldown");
const MarkdownItModule = requireRenderer("markdown-it");
const MarkdownIt = MarkdownItModule.default ?? MarkdownItModule;

const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function measure(name, fn) {
  const start = performance.now();
  const value = fn();
  const elapsedMs = performance.now() - start;
  results.push({ name, elapsedMs: Number(elapsedMs.toFixed(1)) });
  return value;
}

async function measureAsync(name, fn) {
  const start = performance.now();
  const value = await fn();
  const elapsedMs = performance.now() - start;
  results.push({ name, elapsedMs: Number(elapsedMs.toFixed(1)) });
  return value;
}

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://doc.local/renderer.html"
  });
  const { window } = dom;
  for (const name of [
    "window", "document", "DOMParser", "XMLSerializer", "Node", "Element",
    "HTMLElement", "SVGElement", "HTMLIFrameElement", "HTMLTemplateElement",
    "TextEncoder", "TextDecoder", "Event", "MessageEvent", "CustomEvent"
  ]) {
    if (name in window) globalThis[name] = window[name];
  }
  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true, writable: true });
  return dom;
}

async function loadSourceModule(relativePath) {
  const input = resolve(rendererDir, relativePath);
  const bundle = await rolldown({
    input,
    plugins: [{
      name: "benchmark-css-stub",
      load(id) {
        return id.endsWith(".css") ? { code: "export default '';", moduleType: "js" } : null;
      }
    }]
  });
  const generated = await bundle.generate({ format: "es", codeSplitting: false });
  const chunk = generated.output.find((item) => item.type === "chunk");
  assert(chunk, `Rolldown did not emit a chunk for ${relativePath}`);
  const encoded = Buffer.from(chunk.code, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

function settings() {
  return {
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
}

function update(formatHint, text, generation = 1) {
  return {
    type: "preview.update",
    protocolVersion: 2,
    generation,
    bufferId: 1,
    formatHint,
    file: { name: `benchmark.${formatHint === "markdown" ? "md" : formatHint}`, extension: `.${formatHint}`, saved: false },
    source: { kind: "text", text },
    theme: "light",
    settings: settings()
  };
}

function structuredFixture() {
  const leafValues = Array.from({ length: 32 }, (_, index) => `${String(index).padStart(2, "0")}:${"x".repeat(8190)}`);
  let value = { values: leafValues };
  for (let depth = 0; depth < 50; depth += 1) value = { [`level${depth}`]: value };
  let source = JSON.stringify(value);
  const targetBytes = 263019;
  assert(Buffer.byteLength(source, "utf8") <= targetBytes, "structured fixture unexpectedly exceeds target size");
  source += " ".repeat(targetBytes - Buffer.byteLength(source, "utf8"));
  assert(Buffer.byteLength(source, "utf8") === targetBytes, "structured fixture size is not 263019 bytes");
  return source;
}

async function structuredProbe() {
  const mod = await loadSourceModule("src/viewers/structured-viewer.ts");
  const source = structuredFixture();
  const viewer = new mod.StructuredDataViewer();
  const root = document.createElement("article");
  await measureAsync("structured viewer 263019-byte nested JSON", () => viewer.render({
    update: update("json", source),
    effectiveTheme: "light",
    root,
    isCurrent: () => true
  }));

  const copyButtons = [...root.querySelectorAll("button")].filter((button) =>
    button.textContent?.toLowerCase().includes("copy") || button.title?.toLowerCase().includes("copy"));
  assert(copyButtons.length > 0, "structured viewer rendered no copy controls");
  const retainedCopyChars = [...root.querySelectorAll("[data-mpp-copy-value]")]
    .reduce((sum, element) => sum + (element.getAttribute("data-mpp-copy-value")?.length ?? 0), 0);
  assert(retainedCopyChars === 0, `eager copy serialization retained ${retainedCopyChars} chars for ${source.length}-byte input`);

  const codePane = root.querySelector(".mpp-structured-code-pane");
  assert(codePane?.hidden === true, "structured code view should remain lazy while Tree is active");

  // Exercise the real delegated shell handler so lazy values remain usable.
  document.body.innerHTML = '<div id="status"></div><article id="preview"></article>';
  window.requestAnimationFrame ??= (callback) => callback(0);
  window.scrollTo = () => {};
  const copiedValues = [];
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (value) => { copiedValues.push(value); } }
  });
  const app = await loadSourceModule("src/ui/app.ts");
  const shell = new app.ViewerShell(document.querySelector("#status"), document.querySelector("#preview"));
  shell.start();
  await shell.renderUpdate(update("json", '{"value":"copy me"}'), false);
  const copyButton = document.querySelector("#preview button[data-mpp-copy-value]");
  assert(copyButton, "delegated copy probe found no structured copy button");
  copyButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
  assert(copiedValues.some((value) => value.includes("copy me")), "delegated copy handler did not resolve the lazy structured value");
  return {
    inputBytes: Buffer.byteLength(source, "utf8"),
    copyControls: copyButtons.length,
    retainedCopyAttributeChars: retainedCopyChars,
    treeNodes: root.querySelectorAll(".mpp-tree-node, .mpp-tree-leaf").length,
    codePaneInitiallyHidden: codePane?.hidden === true,
    delegatedCopyBytes: copiedValues[0]?.length ?? 0
  };
}

async function mathProbe() {
  const mod = await loadSourceModule("src/markdown/math.ts");
  const placeholders = [];
  const markdown = new MarkdownIt();
  mod.installMathPlugin(markdown, placeholders, { alternateDelimiters: false, generation: 7 });
  const source = Array.from({ length: 1000 }, () => "$x$ ").join("");
  const html = measure("math placeholder registration (1000 expressions)", () => markdown.render(source));
  assert(placeholders.length === 200, `math plugin retained ${placeholders.length} expressions; expected the configured cap of 200`);
  assert(placeholders.length > 0, "math plugin rejected every expression in the cap probe");
  assert((html.match(/mpp-math-placeholder/gu) ?? []).length === placeholders.length, "math placeholder HTML count diverges from registration count");
  const literalCount = (html.match(/\$x\$/gu) ?? []).length;
  assert(literalCount === 800, `math cap did not preserve all 800 overflow expressions as literal text (found ${literalCount})`);
  return { expressions: 1000, retainedPlaceholders: placeholders.length, literalOverflowExpressions: literalCount, placeholderHtmlCount: placeholders.length };
}

function codeRoot(codeModule, sizeBytes) {
  const root = document.createElement("article");
  const line = "const value = 1;\n";
  const repetitions = Math.ceil(sizeBytes / Buffer.byteLength(line, "utf8"));
  const source = line.repeat(repetitions).slice(0, sizeBytes);
  root.innerHTML = codeModule.renderCodeFence("javascript", source, (value) => value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character])), `size-${sizeBytes}`);
  return { root, source };
}

async function highlightProbe() {
  const mod = await loadSourceModule("src/markdown/code.ts");
  const cases = [];
  for (const sizeBytes of [100 * 1024, 1024 * 1024, 5 * 1024 * 1024]) {
    const { root, source } = codeRoot(mod, sizeBytes);
    await measureAsync(`highlight workload ${sizeBytes} bytes`, () => mod.highlightCodeBlocks(root, () => true));
    const code = root.querySelector("code");
    assert(code, `highlight probe produced no code element at ${sizeBytes} bytes`);
    const output = code.innerHTML;
    const spanCount = code.querySelectorAll("span").length;
    assert(output.length <= source.length * 8 + 16384, `highlight output expanded beyond bounded budget at ${sizeBytes} bytes`);
    if (sizeBytes >= 1024 * 1024) assert(spanCount === 0, `oversized ${sizeBytes}-byte block was highlighted instead of using plain fallback`);
    cases.push({ inputBytes: sizeBytes, outputChars: output.length, highlightedSpans: spanCount, plainFallback: spanCount === 0 });
  }
  return cases;
}

async function pipelineProbe() {
  const mod = await loadSourceModule("src/markdown/pipeline.ts");
  const pipeline = new mod.MarkdownPipeline();
  const ordinary = await measureAsync("ordinary Markdown pipeline fixture", () => pipeline.render(update("markdown", "# Overview\n\nA short paragraph.\n\n- one\n- two")));
  assert(ordinary.html.includes('id="overview"'), "ordinary Markdown heading was not rendered");
  assert(ordinary.html.includes("A short paragraph."), "ordinary Markdown paragraph was not rendered");

  const largeSource = `# Large document\n\n${"plain text without formatting. ".repeat(180000)}`;
  const large = await measureAsync("large Markdown pipeline fallback", () => pipeline.render(update("markdown", largeSource, 2)));
  assert(large.html.length <= largeSource.length * 2 + 100000, "large Markdown output exceeded the bounded fallback budget");
  assert(typeof large.fallback === "string" && large.fallback.length > 0, "large Markdown did not report a bounded fallback reason");
  assert(large.html.length === 0 && large.math.length === 0 && large.diagrams.length === 0, "large Markdown fallback still prepared heavy HTML or async work");
  return {
    ordinaryHtmlChars: ordinary.html.length,
    largeInputBytes: Buffer.byteLength(largeSource, "utf8"),
    largeOutputChars: large.html.length,
    largeMathCount: large.math.length,
    largeDiagramCount: large.diagrams.length
  };
}

async function main() {
  installDom();
  const structured = await structuredProbe();
  const math = await mathProbe();
  const highlighting = await highlightProbe();
  const pipeline = await pipelineProbe();
  const report = {
    status: "passed",
    environment: "Node.js + jsdom; production TypeScript bundled in memory by Rolldown",
    timingNote: "Durations are informational only and are not WebView2 or Notepad++ latency measurements.",
    probes: { structured, math, highlighting, pipeline },
    timings: results
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  const report = {
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
    timings: results
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = 1;
});
