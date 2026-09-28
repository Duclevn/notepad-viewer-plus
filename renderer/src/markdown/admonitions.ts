import MarkdownIt from "markdown-it";
import container from "markdown-it-container";

export const ADMONITION_TYPES = new Set([
  "note",
  "tip",
  "info",
  "important",
  "success",
  "warning",
  "caution",
  "danger"
]);

export interface NormalizedAdmonitions {
  source: string;
  found: boolean;
}

function normalizeType(raw: string): string {
  const type = raw.toLowerCase().replace(/[^a-z-]/gu, "");
  return ADMONITION_TYPES.has(type) ? type : "note";
}

function titleFrom(raw: string | undefined, fallback: string): string {
  const value = raw?.trim();
  if (!value) return fallback;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function isBlockquoteLine(line: string, indent: string): boolean {
  return new RegExp(`^${indent}>(?:[ \\t]?.*)?$`, "u").test(line);
}

function normalizeGithubAlert(lines: string[], index: number): { replacement: string[]; next: number } | undefined {
  const match = /^(\s*)>\s*\[!([A-Za-z-]+)\]\s*(.*)$/u.exec(lines[index] ?? "");
  if (!match) return undefined;
  const indent = match[1] ?? "";
  const type = normalizeType(match[2] ?? "note");
  const firstBodyLine = match[3]?.trim();
  const body: string[] = [];
  if (firstBodyLine) body.push(firstBodyLine);

  let cursor = index + 1;
  while (cursor < lines.length) {
    const line = lines[cursor] ?? "";
    if (!isBlockquoteLine(line, indent)) break;
    const stripped = line.slice(indent.length).replace(/^> ?/u, "");
    body.push(stripped);
    cursor += 1;
  }

  while (body.length > 0 && body[body.length - 1] === "") body.pop();
  return {
    replacement: [
      `${indent}::: ${type}`,
      ...body.map((line) => `${indent}${line}`),
      `${indent}:::`
    ],
    next: cursor
  };
}

function normalizeMkdocs(lines: string[], index: number): { replacement: string[]; next: number } | undefined {
  const match = /^(\s*)!!!\s+([A-Za-z-]+)(?:\s+(.*?))?\s*$/u.exec(lines[index] ?? "");
  if (!match) return undefined;
  const indent = match[1] ?? "";
  const type = normalizeType(match[2] ?? "note");
  const rawTitle = match[3];
  const body: string[] = [];
  let cursor = index + 1;
  let sawIndentedLine = false;

  while (cursor < lines.length) {
    const line = lines[cursor] ?? "";
    if (line.trim() === "") {
      body.push("");
      cursor += 1;
      continue;
    }
    if (!line.startsWith(`${indent}    `) && !line.startsWith(`${indent}\t`)) break;
    sawIndentedLine = true;
    body.push(line.startsWith(`${indent}\t`) ? line.slice(indent.length + 1) : line.slice(indent.length + 4));
    cursor += 1;
  }

  if (!sawIndentedLine) return undefined;
  while (body.length > 0 && body[body.length - 1] === "") body.pop();
  const title = rawTitle ? ` ${titleFrom(rawTitle, type)}` : "";
  return {
    replacement: [`${indent}::: ${type}${title}`, ...body.map((line) => `${indent}${line}`), `${indent}:::`],
    next: cursor
  };
}

export function normalizeAdmonitions(source: string): NormalizedAdmonitions {
  const lines = source.split(/\r?\n/u);
  const output: string[] = [];
  let found = false;

  for (let index = 0; index < lines.length; ) {
    const github = normalizeGithubAlert(lines, index);
    if (github) {
      output.push(...github.replacement);
      index = github.next;
      found = true;
      continue;
    }
    const mkdocs = normalizeMkdocs(lines, index);
    if (mkdocs) {
      output.push(...mkdocs.replacement);
      index = mkdocs.next;
      found = true;
      continue;
    }
    output.push(lines[index] ?? "");
    index += 1;
  }

  const protectedContainers = protectContainerMarkers(output);
  return { source: protectedContainers.lines.join("\n"), found: found || protectedContainers.found };
}

function protectContainerMarkers(lines: string[]): { lines: string[]; found: boolean } {
  const output: string[] = [];
  let activeIndent: string | undefined;
  let codeFence: { character: string; length: number } | undefined;
  let found = false;

  for (const line of lines) {
    if (activeIndent === undefined) {
      const opening = /^(\s*):::\s*([A-Za-z-]+)(.*)$/u.exec(line);
      const type = opening?.[2]?.toLowerCase();
      if (opening && type && ADMONITION_TYPES.has(type)) {
        activeIndent = opening[1] ?? "";
        output.push(`${activeIndent}:::: ${type}${opening[3] ?? ""}`);
        found = true;
        continue;
      }
      output.push(line);
      continue;
    }

    const fenceMatch = /^(\s*)(`{3,}|~{3,})(.*)$/u.exec(line);
    if (codeFence) {
      if (fenceMatch && fenceMatch[2]?.[0] === codeFence.character && (fenceMatch[2]?.length ?? 0) >= codeFence.length && !(fenceMatch[3] ?? "").trim()) {
        codeFence = undefined;
      }
      output.push(line);
      continue;
    }
    if (fenceMatch) {
      codeFence = { character: fenceMatch[2]?.[0] ?? "`", length: fenceMatch[2]?.length ?? 3 };
      output.push(line);
      continue;
    }
    if (line === `${activeIndent}:::`) {
      output.push(`${activeIndent}::::`);
      activeIndent = undefined;
      continue;
    }
    output.push(line);
  }

  return { lines: output, found };
}

export function installAdmonitionPlugin(md: InstanceType<typeof MarkdownIt>): void {
  md.use(container, "mpp-admonition", {
    validate(info: string): boolean {
      return /^\s*(?:note|tip|info|important|success|warning|caution|danger)(?:\s+.*)?$/iu.test(info);
    },
    render(tokens: Array<{ nesting: number; info: string }>, index: number): string {
      const token = tokens[index];
      if (!token) return "";
      if (token.nesting === 1) {
        const info = token.info.trim();
        const match = /^(\S+)(?:\s+([\s\S]*))?$/u.exec(info);
        const type = normalizeType(match?.[1] ?? "note");
        const suppliedTitle = match?.[2]?.trim();
        const title = suppliedTitle ? titleFrom(suppliedTitle, type) : type[0]?.toUpperCase() + type.slice(1);
        return `<aside class="mpp-admonition mpp-admonition-${type}" data-admonition-type="${type}"><div class="mpp-admonition-title">${md.utils.escapeHtml(title)}</div>`;
      }
      return "</aside>\n";
    }
  });
}
