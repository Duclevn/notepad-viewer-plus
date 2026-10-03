import { describe, expect, it, vi } from "vitest";
import { highlightCodeBlocks, renderCodeFence } from "../src/markdown/code";
import { MarkdownPipeline } from "../src/markdown/pipeline";
import {
  MAX_HIGHLIGHT_BLOCK_BYTES,
  MAX_HIGHLIGHT_TOTAL_BYTES,
  MAX_MARKDOWN_LINES,
  MAX_MARKDOWN_RENDERED_TAGS,
  MAX_MARKDOWN_SOURCE_BYTES,
  MAX_MATH_EXPRESSIONS
} from "../src/performance/limits";
import { getCopyValue, registerCopyValue } from "../src/viewers/copy-values";
import { StructuredDataViewer } from "../src/viewers/structured-viewer";
import type { DocumentUpdate } from "../src/bridge/protocol";

const settings = {
  showFrontMatter: true,
  showTableOfContents: false,
  rawHtml: true,
  remoteImages: false,
  mathAlternateDelimiters: true,
  codeWrapping: true,
  formatOverride: "auto" as const,
  maximumTextBytes: 5 * 1024 * 1024,
  maximumStructuredBytes: 5 * 1024 * 1024,
  maximumCsvRows: 10000,
  maximumCsvColumns: 100,
  maximumCsvCellBytes: 64 * 1024,
  maximumResourceBytes: 512 * 1024 * 1024
};

function markdownUpdate(text: string): DocumentUpdate {
  return {
    type: "preview.update",
    protocolVersion: 2,
    generation: 1,
    bufferId: 1,
    formatHint: "markdown",
    file: { name: "limits.md", extension: ".md", saved: false },
    source: { kind: "text", text },
    theme: "light",
    settings
  };
}

function jsonUpdate(text: string): DocumentUpdate {
  return {
    ...markdownUpdate(text),
    formatHint: "json",
    file: { name: "limits.json", extension: ".json", saved: false }
  };
}

describe("renderer work limits", () => {
  it("keeps copy values out of DOM attributes until a copy action resolves them", () => {
    const button = document.createElement("button");
    let calls = 0;
    registerCopyValue(button, () => {
      calls += 1;
      return "computed value";
    });

    expect(button.dataset.mppCopyValue).toBe("");
    expect(calls).toBe(0);
    expect(getCopyValue(button)).toBe("computed value");
    expect(calls).toBe(1);
  });

  it("does not serialize structured values or build the Code pane during tree construction", async () => {
    const stringify = vi.spyOn(JSON, "stringify");
    const root = document.createElement("article");
    const source = '{"nested":{"message":"keep this value"},"items":[1,null,true]}';
    await new StructuredDataViewer().render({
      update: jsonUpdate(source),
      effectiveTheme: "light",
      root,
      isCurrent: () => true
    });

    expect(stringify).not.toHaveBeenCalled();
    expect(Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-mpp-copy-value]")).every((button) => button.dataset.mppCopyValue === "")).toBe(true);
    expect(root.querySelector<HTMLElement>(".mpp-structured-code-pane")?.childElementCount).toBe(0);

    const copyAll = root.querySelector<HTMLButtonElement>(".mpp-copy-raw");
    expect(copyAll).not.toBeNull();
    expect(getCopyValue(copyAll!)).toContain('"nested"');
    expect(stringify).toHaveBeenCalledTimes(1);

    root.querySelector<HTMLButtonElement>(".mpp-view-tab[data-mpp-view='code']")?.click();
    expect(root.querySelector<HTMLElement>(".mpp-structured-code-pane")?.childElementCount).toBe(1);
    stringify.mockRestore();
  });

  it("leaves oversized code blocks readable and skips their synchronous highlight work", async () => {
    const root = document.createElement("div");
    const source = "x".repeat(MAX_HIGHLIGHT_BLOCK_BYTES + 1);
    root.innerHTML = renderCodeFence("javascript", source, (value) => value, 1);

    await highlightCodeBlocks(root);

    expect(root.querySelector(".mpp-code-status")?.textContent).toContain("Syntax highlighting skipped");
    expect(root.querySelector("code")?.textContent).toBe(source);
  });

  it("enforces the total highlight budget after per-block limits", async () => {
    const root = document.createElement("div");
    const blockSource = "const value = 1;\n".repeat(Math.ceil((MAX_HIGHLIGHT_TOTAL_BYTES / 5 + 1) / 17));
    for (let index = 0; index < 5; index += 1) {
      root.insertAdjacentHTML("beforeend", renderCodeFence("javascript", blockSource, (value) => value, index));
    }

    await highlightCodeBlocks(root);

    expect(root.querySelectorAll(".mpp-code-status")).toHaveLength(1);
    expect(root.querySelectorAll(".mpp-code-status")[0]?.textContent).toContain("document exceeds");
  });

  it("falls back to readable source before parsing oversized Markdown", async () => {
    const result = await new MarkdownPipeline().render(markdownUpdate("x".repeat(MAX_MARKDOWN_SOURCE_BYTES + 1)));

    expect(result.html).toBe("");
    expect(result.fallback).toContain("1 MiB");
    expect(result.math).toHaveLength(0);
    expect(result.diagrams).toHaveLength(0);
    expect(result.toc).toHaveLength(0);
  });

  it("stops a stale Markdown generation at a task boundary", async () => {
    let current = true;
    const pending = new MarkdownPipeline().render(markdownUpdate("# still current"), () => current);
    current = false;
    const result = await pending;

    expect(result.html).toBe("");
    expect(result.fallback).toBeUndefined();
  });

  it("falls back before parsing sources over the line budget", async () => {
    const source = Array.from({ length: MAX_MARKDOWN_LINES + 1 }, () => "line").join("\n");
    const result = await new MarkdownPipeline().render(markdownUpdate(source));

    expect(result.html).toBe("");
    expect(result.fallback).toContain("20,000-line");
  });

  it("checks rendered tag volume before DOMPurify builds a large tree", async () => {
    const source = "<b>x</b>\n".repeat(Math.ceil((MAX_MARKDOWN_RENDERED_TAGS + 1) / 2));
    const result = await new MarkdownPipeline().render(markdownUpdate(source));

    expect(result.html).toBe("");
    expect(result.fallback).toContain("element limit");
    expect(result.toc).toHaveLength(0);
  });

  it("reports math expressions left as text after the expression budget", async () => {
    const source = Array.from({ length: MAX_MATH_EXPRESSIONS + 1 }, () => "$x$").join("\n");
    const result = await new MarkdownPipeline().render(markdownUpdate(source));

    expect(result.math).toHaveLength(MAX_MATH_EXPRESSIONS);
    expect(result.warnings?.[0]).toContain("additional expression(s) remain as text");
  });
});
