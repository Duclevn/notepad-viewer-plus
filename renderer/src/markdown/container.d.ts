declare module "markdown-it-container" {
  import type MarkdownIt from "markdown-it";

  interface ContainerOptions {
    validate?: (info: string) => boolean;
    render?: (tokens: Array<{ nesting: number; info: string }>, index: number) => string;
    marker?: string;
  }

  const plugin: (md: InstanceType<typeof MarkdownIt>, name: string, options: ContainerOptions) => void;
  export default plugin;
}
