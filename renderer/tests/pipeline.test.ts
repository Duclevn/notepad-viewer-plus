import { describe, expect, it } from "vitest";
import { MarkdownPipeline } from "../src/markdown/pipeline";
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

function update(text: string, generation = 1): DocumentUpdate {
  return {
    type: "preview.update",
    protocolVersion: 2,
    generation,
    bufferId: 7,
    formatHint: "markdown",
    file: { name: "test.md", extension: ".md", saved: false },
    source: { kind: "text", text },
    theme: "light",
    settings
  };
}

describe("MarkdownPipeline", () => {
  it("renders safe front matter as a GitHub-style metadata table", async () => {
    const source = "---\ntitle: Example <script>\ntags:\n  - offline\n  - markdown\noptions:\n  math: true\n  themes:\n    - light\n    - dark\n---\n# Heading";
    const result = await new MarkdownPipeline().render(update(source));

    expect(result.html).toContain('<table class="mpp-front-matter" aria-label="Front matter">');
    expect(result.html).toContain('<th scope="row">title</th>');
    expect(result.html).toContain("mpp-front-matter-collection");
    expect(result.html).toContain("Example &lt;script&gt;");
    expect(result.html).toContain("<h1>Heading</h1>");
    expect(result.html).not.toContain("<h2>title</h2>");
    expect(result.html).not.toContain("<pre>");
  });

  it("renders an optional table of contents with safe unique heading links", async () => {
    const withToc = update("# Overview\n\n## Install *now*\n\n## Install now\n\n### 日本語\n\n#### !!!\n\n#### ???\n\n##### Conflict\n\n##### Conflict 2\n\n##### Conflict");
    withToc.settings = { ...withToc.settings, showTableOfContents: true };
    const result = await new MarkdownPipeline().render(withToc);

    expect(result.html).toContain('aria-label="Table of contents"');
    expect(result.html).toContain('<a href="#overview">Overview</a>');
    expect(result.html).toContain('<a href="#install-now">Install now</a>');
    expect(result.html).toContain('<a href="#install-now-2">Install now</a>');
    expect(result.html).toContain('<a href="#日本語">日本語</a>');
    expect(result.html).toContain('<a href="#section">!!!</a>');
    expect(result.html).toContain('<a href="#section-2">???</a>');
    expect(result.html).toContain('<a href="#conflict-3">Conflict</a>');
    expect(result.html).toContain('<h2 id="install-now-2">Install now</h2>');
    expect(result.html).toContain('<h5 id="conflict-3">Conflict</h5>');

    const withoutToc = await new MarkdownPipeline().render(update("# Overview"));
    expect(withoutToc.html).not.toContain('aria-label="Table of contents"');

    const manyHeadings = update(Array.from({ length: 501 }, (_, index) => `# Heading ${index + 1}`).join("\n\n"));
    manyHeadings.settings = { ...manyHeadings.settings, showTableOfContents: true };
    const bounded = await new MarkdownPipeline().render(manyHeadings);
    expect(bounded.html.match(/class="mpp-toc-level-/gu)).toHaveLength(500);
    expect(bounded.html).toContain('<h1 id="heading-501">Heading 501</h1>');
  });

  it("bounds large front matter collections and reserves the final cell for an ellipsis", async () => {
    const fields = Array.from({ length: 101 }, (_, index) => `field${index}: value${index}`).join("\n");
    const result = await new MarkdownPipeline().render(update(`---\n${fields}\n---\nBody`));

    expect(result.html.match(/<th scope="row">/gu)).toHaveLength(100);
    expect(result.html).toContain('<th scope="row">…</th><td>…</td>');
    expect(result.html).not.toContain("field99");
  });

  it("keeps the Markdown renderable when YAML is malformed", async () => {
    const result = await new MarkdownPipeline().render(update("---\nvalue: [broken\n---\n# Still rendered"));

    expect(result.html).toContain("Front matter could not be parsed");
    expect(result.html).toContain("<h1>Still rendered</h1>");
  });

  it("preserves GitHub table alignment and renders task-list checkboxes", async () => {
    const source = [
      "| Left | Center | Right |",
      "|:---|:---:|---:|",
      "| A | B | C |",
      "",
      "- [x] Complete",
      "- [ ] Pending"
    ].join("\n");
    const result = await new MarkdownPipeline().render(update(source));

    expect(result.html).toContain('class="mpp-align-left"');
    expect(result.html).toContain('class="mpp-align-center"');
    expect(result.html).toContain('class="mpp-align-right"');
    expect(result.html).not.toContain("text-align:");
    expect(result.html.match(/class="task-list-item"/gu)).toHaveLength(2);
    expect(result.html).toContain('aria-label="Completed task"');
    expect(result.html).toContain('aria-label="Incomplete task"');
    expect(result.html).toMatch(/type="checkbox"[^>]*disabled[^>]*checked/u);
    expect(result.html).toMatch(/type="checkbox"[^>]*disabled(?![^>]*checked)/u);

    const strictUpdate = update("- [x] Still generated safely");
    strictUpdate.settings = { ...strictUpdate.settings, rawHtml: false };
    const strictResult = await new MarkdownPipeline().render(strictUpdate);
    expect(strictResult.html).toContain('type="checkbox"');
    expect(strictResult.html).toContain("checked");

    const mixedResult = await new MarkdownPipeline().render(update("- Parent\n  - Nested child\n- [x] Root task"));
    const template = document.createElement("template");
    template.innerHTML = mixedResult.html;
    const taskItem = template.content.querySelector(".task-list-item");
    expect(taskItem?.parentElement?.classList.contains("contains-task-list")).toBe(true);
    expect(template.content.querySelector("li > ul")?.classList.contains("contains-task-list")).toBe(false);

    const nestedTaskResult = await new MarkdownPipeline().render(update("- Parent\n  - [x] Nested task"));
    template.innerHTML = nestedTaskResult.html;
    const lists = template.content.querySelectorAll("ul");
    expect(lists[0]?.classList.contains("contains-task-list")).toBe(false);
    expect(lists[1]?.classList.contains("contains-task-list")).toBe(true);
  });

  it("normalizes GitHub and MkDocs admonitions", async () => {
    const source = [
      "> [!WARNING] Be careful",
      "> The body is retained.",
      "",
      "!!! tip \"A hint\"",
      "    Use the feature offline.",
      "",
      "::: danger Custom title",
      "Unsafe input is still text.",
      ":::"
    ].join("\n");
    const result = await new MarkdownPipeline().render(update(source));

    expect(result.html).toContain("mpp-admonition-warning");
    expect(result.html).toContain("mpp-admonition-tip");
    expect(result.html).toContain("mpp-admonition-danger");
    expect(result.html).toContain("The body is retained.");
    expect(result.html).toContain("A hint");
  });

  it("does not close admonitions on a literal container marker inside fenced code", async () => {
    const source = [
      ":::note",
      "Before the fence.",
      "",
      "```text",
      "literal ::: text",
      ":::",
      "```",
      "",
      "~~~text",
      ":::",
      "~~~",
      "",
      "After the fence.",
      ":::",
      "",
      ":::tip",
      "Second callout.",
      ":::"
    ].join("\n");
    const result = await new MarkdownPipeline().render(update(source));

    expect(result.html.match(/class="mpp-admonition /gu)).toHaveLength(2);
    expect(result.html).toContain("After the fence.");
    expect(result.html).toContain("literal ::: text");
    expect(result.html).toContain("<code>:::\n</code>");
    expect(result.html).toContain("mpp-admonition-tip");
  });

  it("creates lazy placeholders for math and diagrams", async () => {
    const source = [
      "Inline $x^2$ and $$y^2$$.",
      "",
      "```math",
      "\\frac{1}{2}",
      "```",
      "",
      "```mermaid",
      "flowchart LR\n  A --> B",
      "```",
      "",
      "```plantuml",
      "@startuml\nAlice -> Bob: Hi\n@enduml",
      "```"
    ].join("\n");
    const result = await new MarkdownPipeline().render(update(source, 9));

    expect(result.math).toHaveLength(3);
    expect(result.diagrams.map((diagram) => diagram.engine)).toEqual(["mermaid", "plantuml"]);
    expect(result.html).toContain("data-mpp-math=\"math-9-0\"");
    expect(result.html).toContain("data-mpp-diagram=\"diagram-9-0\"");
  });

  it("renders allowed and unknown code fences without trusting source HTML", async () => {
    const result = await new MarkdownPipeline().render(update("```javascript\nconst value = '<script>alert(1)</script>';\n```\n\n```unknown\n<em>text</em>\n```"));

    expect(result.html).toContain("data-mpp-language=\"javascript\"");
    expect(result.html).toContain("data-mpp-language=\"\"");
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain("<script>alert");
  });
});
