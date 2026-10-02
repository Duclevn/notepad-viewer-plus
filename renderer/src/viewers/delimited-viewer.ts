import type { ViewerAdapter, ViewerContext, ViewerResult } from "./types";

export interface DelimitedParseResult {
  delimiter: string;
  rows: string[][];
  truncated: boolean;
}

const CANDIDATE_DELIMITERS = [",", ";", "|", "\t"] as const;
const ROW_HEIGHT = 30;
const UTF8_ENCODER = new TextEncoder();
const TRUNCATION_MARK = "…";
const TRUNCATION_MARK_BYTES = UTF8_ENCODER.encode(TRUNCATION_MARK).byteLength;

export class DelimitedViewer implements ViewerAdapter {
  public readonly id = "csv" as const;
  public readonly themeBehavior = "native" as const;
  private cleanup: (() => void) | undefined;

  public canRender(context: ViewerContext): boolean {
    return context.update.source.kind === "text" &&
      (context.update.formatHint === "csv" || context.update.formatHint === "tsv" ||
       context.update.settings.formatOverride === "csv" || context.update.settings.formatOverride === "tsv");
  }

  public async render(context: ViewerContext): Promise<ViewerResult> {
    this.cleanup?.();
    this.cleanup = undefined;
    context.root.replaceChildren();
    if (context.update.source.kind !== "text") {
      context.root.textContent = context.update.source.kind === "unavailable" ? context.update.source.reason : "Delimited source is unavailable.";
      return {};
    }
    const delimiter = context.update.settings.formatOverride === "tsv" || context.update.formatHint === "tsv"
      ? "\t"
      : detectDelimiter(context.update.source.text);
    const parsed = parseDelimited(context.update.source.text, delimiter, {
      maxRows: context.update.settings.maximumCsvRows,
      maxColumns: context.update.settings.maximumCsvColumns,
      maxCellBytes: context.update.settings.maximumCsvCellBytes
    });
    renderGrid(context.root, parsed);
    return parsed.truncated ? { warnings: ["Delimited input was truncated at the configured row, column, or cell limit."] } : {};
  }

  public dispose(): void {
    this.cleanup?.();
    this.cleanup = undefined;
  }
}

export function detectDelimiter(source: string): string {
  const sample = source.slice(0, 32_768);
  let best = ",";
  let bestScore = -1;
  for (const delimiter of CANDIDATE_DELIMITERS) {
    const score = sample.split(/\r?\n/u).slice(0, 20).reduce((total, line) => total + countOutsideQuotes(line, delimiter), 0);
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

export function parseDelimited(
  source: string,
  delimiter: string,
  limits: { maxRows: number; maxColumns: number; maxCellBytes: number }
): DelimitedParseResult {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let truncated = false;
  const appendCell = (): void => {
    const boundedCell = truncateUtf8(cell, limits.maxCellBytes);
    if (boundedCell.truncated) {
      cell = boundedCell.value;
      truncated = true;
    }
    if (row.length >= limits.maxColumns) {
      truncated = true;
    } else {
      row.push(cell);
    }
    cell = "";
  };
  const appendRow = (): boolean => {
    appendCell();
    if (rows.length >= limits.maxRows) {
      truncated = true;
      return false;
    }
    rows.push(row);
    row = [];
    return true;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      appendCell();
    } else if (character === "\n") {
      if (source[index - 1] === "\r") cell = cell.slice(0, -1);
      if (!appendRow()) break;
    } else {
      cell += character;
    }
  }
  if (cell.length > 0 || row.length > 0 || source.endsWith(delimiter)) appendRow();
  return { delimiter, rows, truncated };
}

function truncateUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
  if (UTF8_ENCODER.encode(value).byteLength <= maxBytes) return { value, truncated: false };

  const limit = Math.max(0, maxBytes);
  const mark = limit >= TRUNCATION_MARK_BYTES ? TRUNCATION_MARK : "";
  const prefixLimit = limit - (mark ? TRUNCATION_MARK_BYTES : 0);
  let prefix = "";
  let prefixBytes = 0;
  for (const character of value) {
    const characterBytes = UTF8_ENCODER.encode(character).byteLength;
    if (prefixBytes + characterBytes > prefixLimit) break;
    prefix += character;
    prefixBytes += characterBytes;
  }
  return { value: `${prefix}${mark}`, truncated: true };
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    else if (!quoted && line[index] === delimiter) count += 1;
  }
  return count;
}

function renderGrid(root: HTMLElement, parsed: DelimitedParseResult): void {
  root.replaceChildren();
  const wrapper = document.createElement("section");
  wrapper.className = "mpp-delimited-viewer";
  wrapper.setAttribute("aria-label", "Delimited text grid");
  const info = document.createElement("div");
  info.className = "mpp-delimited-info";
  const columnCount = parsed.rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  info.textContent = `${parsed.rows.length} rows × ${columnCount} columns · delimiter ${parsed.delimiter === "\t" ? "TAB" : parsed.delimiter}`;
  wrapper.appendChild(info);
  if (parsed.truncated) {
    const warning = document.createElement("div");
    warning.className = "mpp-warning";
    warning.textContent = "This view is truncated to keep the grid responsive.";
    wrapper.appendChild(warning);
  }

  const header = document.createElement("table");
  header.className = "mpp-delimited-header";
  const headerRow = document.createElement("tr");
  for (let column = 0; column < columnCount; column += 1) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = parsed.rows[0]?.[column] ?? `Column ${column + 1}`;
    headerRow.appendChild(cell);
  }
  header.appendChild(document.createElement("thead")).appendChild(headerRow);
  wrapper.appendChild(header);

  const viewport = document.createElement("div");
  viewport.className = "mpp-delimited-viewport";
  const spacer = document.createElement("div");
  spacer.className = "mpp-delimited-spacer";
  spacer.style.height = `${Math.max(0, parsed.rows.length - 1) * ROW_HEIGHT}px`;
  viewport.appendChild(spacer);
  const table = document.createElement("table");
  table.className = "mpp-delimited-body";
  const body = document.createElement("tbody");
  table.appendChild(body);
  viewport.appendChild(table);
  wrapper.appendChild(viewport);
  root.appendChild(wrapper);

  const dataRows = parsed.rows.slice(1);
  const renderWindow = (): void => {
    const start = Math.max(0, Math.floor(viewport.scrollTop / ROW_HEIGHT) - 5);
    const end = Math.min(dataRows.length, start + 45);
    table.style.transform = `translateY(${start * ROW_HEIGHT}px)`;
    body.replaceChildren();
    for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
      const row = document.createElement("tr");
      const values = dataRows[rowIndex] ?? [];
      for (let column = 0; column < columnCount; column += 1) {
        const cell = document.createElement("td");
        cell.textContent = values[column] ?? "";
        row.appendChild(cell);
      }
      body.appendChild(row);
    }
  };
  viewport.addEventListener("scroll", renderWindow, { passive: true });
  renderWindow();
}
