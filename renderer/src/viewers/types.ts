import type { PreviewUpdate, ViewerFormat } from "../bridge/protocol";

export interface ViewerContext {
  update: PreviewUpdate;
  root: HTMLElement;
  directoryToken?: string;
  isCurrent: () => boolean;
}

export interface ViewerResult {
  warnings?: string[];
}

export interface ViewerAdapter {
  readonly id: ViewerFormat;
  canRender(context: ViewerContext): boolean;
  render(context: ViewerContext): Promise<ViewerResult>;
  dispose(): void;
}
