import MarkdownIt from "markdown-it";
import { textSource, type DocumentUpdate } from "../bridge/protocol";
import { installAdmonitionPlugin, normalizeAdmonitions } from "./admonitions";
import { renderCodeFence } from "./code";
import { parseFrontMatter, type FrontMatterResult } from "./front-matter";
import { installGitHubCompatibility } from "./github";
import { installMathPlugin, type MathPlaceholder } from "./math";
import { installDiagramPlugin, type DiagramPlaceholder } from "../diagrams/diagrams";
import { escapeText, sanitizeHtml } from "../security/sanitize";

export interface RenderResult {
  generation: number;
  html: string;
  frontMatter: FrontMatterResult;
  math: MathPlaceholder[];
  diagrams: DiagramPlaceholder[];
  hasHighlightedCode: boolean;
}

interface TableOfContentsHeading {
  id: string;
  level: number;
  title: string;
}

export class MarkdownPipeline {
  public async render(update: DocumentUpdate): Promise<RenderResult> {
    const text = textSource(update);
    if (text === undefined) throw new Error("Markdown viewer requires a text source");
    const frontMatter = await parseFrontMatter(text);
    const source = frontMatter.hasFrontMatter ? frontMatter.body : text;
    const normalized = normalizeAdmonitions(source);
    const math: MathPlaceholder[] = [];
    const diagrams: DiagramPlaceholder[] = [];
    const headings: TableOfContentsHeading[] = [];
    const headingIds = new Set<string>();
    let codeSequence = 0;

    const md = new MarkdownIt({
      html: update.settings.rawHtml,
      breaks: false,
      linkify: false,
      typographer: false
    });
    installAdmonitionPlugin(md);
    installGitHubCompatibility(md);

    if (update.settings.showTableOfContents) {
      const defaultHeadingOpen = md.renderer.rules.heading_open;
      md.renderer.rules.heading_open = (tokens, index, options, env, self): string => {
        const token = tokens[index];
        const inline = tokens[index + 1];
        if (token && /^h[1-6]$/u.test(token.tag) && inline?.type === "inline") {
          const title = headingText(inline);
          const baseId = slugifyHeading(title);
          let id = baseId;
          for (let suffix = 2; headingIds.has(id); suffix += 1) id = `${baseId}-${suffix}`;
          headingIds.add(id);
          token.attrSet("id", id);
          if (headings.length < MAX_TOC_HEADINGS) {
            headings.push({ id, level: Number(token.tag.slice(1)), title });
          }
        }
        return defaultHeadingOpen
          ? defaultHeadingOpen(tokens, index, options, env, self)
          : self.renderToken(tokens, index, options);
      };
    }

    md.renderer.rules.fence = (tokens, index, _options, _env, _self): string => {
      const token = tokens[index];
      if (!token) return "";
      const language = token.info.trim().split(/\s+/u)[0] ?? "";
      return renderCodeFence(language, token.content, md.utils.escapeHtml, `${update.generation}-${codeSequence++}`);
    };
    installDiagramPlugin(md, diagrams, update.generation);
    installMathPlugin(md, math, {
      alternateDelimiters: update.settings.mathAlternateDelimiters,
      generation: update.generation
    });

    let bodyHtml = md.render(normalized.source);
    if (update.settings.showTableOfContents && headings.length > 0) {
      bodyHtml = `${renderTableOfContents(headings)}${bodyHtml}`;
    }
    bodyHtml = sanitizeHtml(bodyHtml, update.settings.rawHtml);
    const metadata = this.renderFrontMatter(frontMatter, update.settings.showFrontMatter);
    const warning = frontMatter.warning ? `<div class="mpp-warning" role="alert">${escapeText(frontMatter.warning)}</div>` : "";
    const html = `${warning}${metadata}${bodyHtml}`;

    return {
      generation: update.generation,
      html,
      frontMatter,
      math,
      diagrams,
      hasHighlightedCode: codeSequence > 0
    };
  }

  private renderFrontMatter(frontMatter: FrontMatterResult, visible: boolean): string {
    if (!frontMatter.hasFrontMatter || !visible) return "";
    if (!isMetadataRecord(frontMatter.data)) {
      return `<div class="mpp-front-matter-fallback" aria-label="Front matter">${renderMetadataValue(frontMatter.data, 0, new WeakSet())}</div>`;
    }

    const rows = limitedEntries(frontMatter.data).map(([key, value]) =>
      `<tr><th scope="row">${escapeText(key)}</th><td>${renderMetadataValue(value, 0, new WeakSet())}</td></tr>`
    ).join("");
    return `<table class="mpp-front-matter" aria-label="Front matter"><tbody>${rows}</tbody></table>`;
  }
}

const MAX_METADATA_ITEMS = 100;
const MAX_METADATA_DEPTH = 8;
const MAX_TOC_HEADINGS = 500;

function headingText(token: { content: string; children: Array<{ type: string; content: string }> | null }): string {
  const children = token.children ?? [];
  const value = children.length > 0
    ? children
      .filter((child) => child.type === "text" || child.type === "code_inline" || child.type === "image" || child.type === "softbreak" || child.type === "hardbreak")
      .map((child) => child.type === "softbreak" || child.type === "hardbreak" ? " " : child.content)
      .join("")
    : token.content;
  return value.replace(/\s+/gu, " ").trim() || "Untitled section";
}

function slugifyHeading(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug || "section";
}

function renderTableOfContents(headings: TableOfContentsHeading[]): string {
  const items = headings.map((heading) =>
    `<li class="mpp-toc-level-${heading.level}"><a href="#${escapeText(heading.id)}">${escapeText(heading.title)}</a></li>`
  ).join("");
  return `<aside class="mpp-toc" aria-label="Table of contents"><details open><summary>Table of contents</summary><ul class="mpp-toc-list">${items}</ul></details></aside>`;
}

function isMetadataRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function limitedEntries(value: Record<string, unknown>): Array<[string, unknown]> {
  const allEntries = Object.entries(value);
  if (allEntries.length <= MAX_METADATA_ITEMS) return allEntries;
  return [...allEntries.slice(0, MAX_METADATA_ITEMS - 1), ["…", "…"]];
}

function renderMetadataValue(value: unknown, depth: number, ancestors: WeakSet<object>): string {
  if (value === null || value === undefined) return '<span class="mpp-front-matter-empty">null</span>';
  if (typeof value !== "object") return escapeText(String(value));
  if (depth >= MAX_METADATA_DEPTH) return '<span class="mpp-front-matter-empty">…</span>';
  if (ancestors.has(value)) return '<span class="mpp-front-matter-empty">[circular]</span>';

  ancestors.add(value);
  let html: string;
  if (Array.isArray(value)) {
    const truncated = value.length > MAX_METADATA_ITEMS;
    const items = value.slice(0, truncated ? MAX_METADATA_ITEMS - 1 : MAX_METADATA_ITEMS);
    const cells = items.map((item) => `<td>${renderMetadataValue(item, depth + 1, ancestors)}</td>`);
    if (truncated) cells.push('<td class="mpp-front-matter-empty">…</td>');
    html = items.length === 0
      ? '<span class="mpp-front-matter-empty">[]</span>'
      : `<table class="mpp-front-matter-collection"><tbody><tr>${cells.join("")}</tr></tbody></table>`;
  } else if (isMetadataRecord(value)) {
    const entries = limitedEntries(value);
    html = entries.length === 0
      ? '<span class="mpp-front-matter-empty">{}</span>'
      : `<table class="mpp-front-matter-collection"><thead><tr>${entries.map(([key]) => `<th scope="col">${escapeText(key)}</th>`).join("")}</tr></thead><tbody><tr>${entries.map(([, item]) => `<td>${renderMetadataValue(item, depth + 1, ancestors)}</td>`).join("")}</tr></tbody></table>`;
  } else {
    html = escapeText(String(value));
  }
  ancestors.delete(value);
  return html;
}
