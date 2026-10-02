import type { PreviewUpdate, ViewerFormat } from "../bridge/protocol";

export type EffectiveTheme = "light" | "dark";
/** Describes the top-level adapter; mixed Markdown content may add nested compatibility surfaces. */
export type ViewerThemeBehavior = "native" | "theme-aware" | "light-canvas" | "selectable-canvas" | "isolated";

export interface ViewerContext {
  update: PreviewUpdate;
  effectiveTheme: EffectiveTheme;
  root: HTMLElement;
  directoryToken?: string;
  isCurrent: () => boolean;
}

export interface ViewerResult {
  warnings?: string[];
}

export interface ViewerAdapter {
  readonly id: ViewerFormat;
  readonly themeBehavior: ViewerThemeBehavior;
  canRender(context: ViewerContext): boolean;
  render(context: ViewerContext): Promise<ViewerResult>;
  dispose(): void;
}
