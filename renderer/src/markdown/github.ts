import MarkdownIt, { type RendererRule, type StateCore, type Token } from "markdown-it";

const TASK_MARKER = /^\[([ xX])\]\s+/u;
const TABLE_ALIGNMENT = /^text-align\s*:\s*(left|center|right)\s*;?$/iu;

export function installGitHubCompatibility(md: InstanceType<typeof MarkdownIt>): void {
  installTableAlignment(md);
  md.core.ruler.after("inline", "mpp-task-lists", applyTaskLists);
}

function installTableAlignment(md: InstanceType<typeof MarkdownIt>): void {
  const renderAlignedCell: RendererRule = (tokens, index, options, _env, renderer): string => {
    const token = tokens[index];
    const style = String(token?.attrGet("style") ?? "");
    const alignment = TABLE_ALIGNMENT.exec(style)?.[1]?.toLowerCase();
    if (token && alignment) {
      const styleIndex = token.attrIndex("style");
      if (styleIndex >= 0) token.attrs?.splice(styleIndex, 1);
      token.attrJoin("class", `mpp-align-${alignment}`);
    }
    return renderer.renderToken(tokens, index, options);
  };

  md.renderer.rules.th_open = renderAlignedCell;
  md.renderer.rules.td_open = renderAlignedCell;
}

function applyTaskLists(state: StateCore): void {
  for (let index = 2; index < state.tokens.length; index += 1) {
    const inline = state.tokens[index];
    const paragraph = state.tokens[index - 1];
    const listItem = state.tokens[index - 2];
    if (!inline || !paragraph || !listItem || inline.type !== "inline" || paragraph.type !== "paragraph_open" || listItem.type !== "list_item_open") continue;

    const firstChild = inline.children?.[0];
    const match = firstChild?.type === "text" ? TASK_MARKER.exec(firstChild.content) : undefined;
    if (!firstChild || !match) continue;

    const checked = match[1]?.toLowerCase() === "x";
    firstChild.content = firstChild.content.slice(match[0].length);
    inline.children?.unshift(createCheckboxToken(state, checked));
    listItem.attrJoin("class", "task-list-item");
    markContainingList(state.tokens, index, listItem.level);
  }
}

function createCheckboxToken(state: StateCore, checked: boolean): Token {
  const checkbox = new state.Token("html_inline", "", 0);
  checkbox.content = `<input class="task-list-item-checkbox" type="checkbox" aria-label="${checked ? "Completed task" : "Incomplete task"}" disabled${checked ? " checked" : ""}> `;
  return checkbox;
}

function markContainingList(tokens: Token[], fromIndex: number, listItemLevel: number): void {
  const parentLevel = listItemLevel - 1;
  for (let index = fromIndex - 3; index >= 0; index -= 1) {
    const token = tokens[index];
    if (!token || token.level !== parentLevel) continue;
    if (token.type === "bullet_list_open" || token.type === "ordered_list_open") {
      const classes = String(token.attrGet("class") ?? "").split(/\s+/u);
      if (!classes.includes("contains-task-list")) token.attrJoin("class", "contains-task-list");
      return;
    }
  }
}
