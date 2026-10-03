import {
  MAX_HIGHLIGHT_BLOCK_BYTES,
  MAX_HIGHLIGHT_TOTAL_BYTES,
  utf8ByteLength
} from "../performance/limits";

export const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  js: "javascript",
  javascript: "javascript",
  jsx: "javascript",
  ts: "typescript",
  typescript: "typescript",
  tsx: "typescript",
  json: "json",
  xml: "xml",
  html: "xml",
  xhtml: "xml",
  svg: "xml",
  css: "css",
  scss: "scss",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  markdown: "markdown",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  powershell: "powershell",
  ps: "powershell",
  ps1: "powershell",
  python: "python",
  py: "python",
  java: "java",
  kotlin: "kotlin",
  kt: "kotlin",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  csharp: "csharp",
  cs: "csharp",
  sql: "sql",
  go: "go",
  rust: "rust",
  rs: "rust",
  php: "php",
  dockerfile: "dockerfile"
};

const LANGUAGE_IMPORTS: Readonly<Record<string, () => Promise<unknown>>> = {
  javascript: () => import("highlight.js/lib/languages/javascript"),
  typescript: () => import("highlight.js/lib/languages/typescript"),
  json: () => import("highlight.js/lib/languages/json"),
  xml: () => import("highlight.js/lib/languages/xml"),
  css: () => import("highlight.js/lib/languages/css"),
  scss: () => import("highlight.js/lib/languages/scss"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
  markdown: () => import("highlight.js/lib/languages/markdown"),
  bash: () => import("highlight.js/lib/languages/bash"),
  powershell: () => import("highlight.js/lib/languages/powershell"),
  python: () => import("highlight.js/lib/languages/python"),
  java: () => import("highlight.js/lib/languages/java"),
  kotlin: () => import("highlight.js/lib/languages/kotlin"),
  c: () => import("highlight.js/lib/languages/c"),
  cpp: () => import("highlight.js/lib/languages/cpp"),
  csharp: () => import("highlight.js/lib/languages/csharp"),
  sql: () => import("highlight.js/lib/languages/sql"),
  go: () => import("highlight.js/lib/languages/go"),
  rust: () => import("highlight.js/lib/languages/rust"),
  php: () => import("highlight.js/lib/languages/php"),
  dockerfile: () => import("highlight.js/lib/languages/dockerfile")
};

export function canonicalLanguage(raw: string): string | undefined {
  const normalized = raw.trim().toLowerCase().replace(/^language-/u, "");
  return LANGUAGE_ALIASES[normalized];
}

export function renderCodeFence(language: string, content: string, escapeHtml: (value: string) => string, id: string | number): string {
  const canonical = canonicalLanguage(language);
  const label = language.trim() || "text";
  const className = canonical ? ` class="language-${canonical}"` : "";
  return `<div class="mpp-code-block" data-mpp-code="code-${id}" data-mpp-language="${escapeHtml(canonical ?? "")}"><div class="mpp-code-toolbar"><span class="mpp-code-language">${escapeHtml(label)}</span><button type="button" class="mpp-copy-code" data-copy-code="code-${id}">Copy</button></div><pre><code${className}>${escapeHtml(content)}</code></pre></div>`;
}

export async function highlightCodeBlocks(root: ParentNode, isCurrent: () => boolean = () => true): Promise<void> {
  if (!isCurrent()) return;
  const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-mpp-code][data-mpp-language]"));
  const candidates: Array<{ element: HTMLElement; code: HTMLElement; language: string }> = [];
  let totalBytes = 0;
  let totalLimitReached = false;
  for (const element of elements) {
    const language = element.dataset.mppLanguage;
    if (!language || !(language in LANGUAGE_IMPORTS)) continue;
    const code = element.querySelector<HTMLElement>("code");
    if (!code) continue;
    const source = code.textContent ?? "";
    const bytes = utf8ByteLength(source, MAX_HIGHLIGHT_BLOCK_BYTES);
    if (bytes > MAX_HIGHLIGHT_BLOCK_BYTES) {
      markHighlightSkipped(element, `code block exceeds ${formatBytes(MAX_HIGHLIGHT_BLOCK_BYTES)}`);
      continue;
    }
    if (totalLimitReached || totalBytes + bytes > MAX_HIGHLIGHT_TOTAL_BYTES) {
      totalLimitReached = true;
      markHighlightSkipped(element, `document exceeds ${formatBytes(MAX_HIGHLIGHT_TOTAL_BYTES)} of code`);
      continue;
    }
    totalBytes += bytes;
    candidates.push({ element, code, language });
  }
  if (candidates.length === 0) return;

  const languages = new Set(candidates.map(({ language }) => language));

  const hljsModule = await import("highlight.js/lib/core");
  if (!isCurrent()) return;
  const hljs = hljsModule.default;
  await Promise.all(
    [...languages].map(async (language) => {
      if (hljs.getLanguage(language)) return;
      const loader = LANGUAGE_IMPORTS[language];
      if (!loader) return;
      const module = await loader();
      const grammar = (module as { default?: unknown }).default;
      if (typeof grammar === "function") hljs.registerLanguage(language, grammar as Parameters<typeof hljs.registerLanguage>[1]);
    })
  );

  for (const { code, language } of candidates) {
    if (!isCurrent()) return;
    if (!language || !hljs.getLanguage(language)) continue;
    const result = hljs.highlight(code.textContent ?? "", { language, ignoreIllegals: true });
    code.innerHTML = result.value;
  }
}

function markHighlightSkipped(element: HTMLElement, reason: string): void {
  const toolbar = element.querySelector<HTMLElement>(".mpp-code-toolbar");
  if (!toolbar || toolbar.querySelector(".mpp-code-status")) return;
  const status = document.createElement("span");
  status.className = "mpp-code-status";
  status.textContent = `Syntax highlighting skipped: ${reason}.`;
  toolbar.appendChild(status);
}

function formatBytes(value: number): string {
  return `${Math.round(value / 1024)} KiB`;
}
