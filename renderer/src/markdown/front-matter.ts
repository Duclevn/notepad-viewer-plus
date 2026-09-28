export interface FrontMatterResult {
  hasFrontMatter: boolean;
  body: string;
  raw: string;
  data?: unknown;
  warning?: string;
}

const OPENING = /^(?:\uFEFF)?---[ \t]*\r?\n/u;
const CLOSING = /^(?:---|\.\.\.)[ \t]*\r?\n/mu;

export function splitFrontMatter(source: string): { hasFrontMatter: boolean; body: string; raw: string; warning?: string } {
  const opening = source.match(OPENING);
  if (!opening) return { hasFrontMatter: false, body: source, raw: "" };

  const afterOpening = source.slice(opening[0].length);
  const closingMatch = CLOSING.exec(afterOpening);
  if (!closingMatch || closingMatch.index > 1024 * 1024) {
    return {
      hasFrontMatter: false,
      body: source,
      raw: "",
      warning: "Front matter starts with '---' but has no closing delimiter. It was left in the document."
    };
  }

  return {
    hasFrontMatter: true,
    raw: afterOpening.slice(0, closingMatch.index),
    body: afterOpening.slice(closingMatch.index + closingMatch[0].length)
  };
}

export async function parseFrontMatter(source: string): Promise<FrontMatterResult> {
  const split = splitFrontMatter(source);
  if (!split.hasFrontMatter) return split;

  try {
    const yaml = await import("js-yaml");
    const data = yaml.load(split.raw, {
      schema: yaml.FAILSAFE_SCHEMA,
      json: true
    });
    return { ...split, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid YAML";
    return {
      ...split,
      warning: `Front matter could not be parsed: ${message}`
    };
  }
}

