import { GenerationGate, RendererBridge } from "../bridge/bridge";
import { makeRenderCompleteMessage, makeRenderErrorMessage, type PreviewUpdate } from "../bridge/protocol";
import { bindResourceEvents } from "../security/resource-policy";
import { ViewerRegistry } from "../viewers/registry";
import "./styles.css";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Preview UI element is missing: ${selector}`);
  return element;
}

export class ViewerShell {
  private readonly gate = new GenerationGate();
  private readonly bridge = new RendererBridge();
  private readonly registry = new ViewerRegistry();
  private activeDirectoryToken: string | undefined;

  public constructor(
    private readonly statusElement: HTMLElement,
    private readonly previewElement: HTMLElement
  ) {}

  public start(): void {
    this.setStatus("Waiting for document…", "loading");
    this.bridge.subscribe((update) => {
      void this.renderUpdate(update);
    });
    this.bridge.start();
    bindResourceEvents(this.previewElement, this.bridge, () => this.activeDirectoryToken);
    this.previewElement.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-copy-code],button[data-mpp-copy-value]") : undefined;
      if (!target) return;
      const codeId = target.dataset.copyCode;
      const code = codeId ? this.previewElement.querySelector<HTMLElement>(`[data-mpp-code="${codeId}"] code`) : undefined;
      const value = codeId ? code?.textContent ?? "" : target.dataset.mppCopyValue ?? "";
      if (!value && !code) return;
      void this.copyValue(value, target);
    });
  }

  public async renderUpdate(update: PreviewUpdate): Promise<void> {
    if (!this.gate.accept(update.generation)) return;
    this.activeDirectoryToken = update.directoryToken;
    document.documentElement.dataset.theme = update.theme;
    this.previewElement.classList.toggle("mpp-no-wrap", !update.settings.codeWrapping);
    this.setStatus("Rendering…", "loading");
    const scroll = captureScroll();
    this.registry.dispose();

    try {
      const result = await this.registry.render({
        update,
        root: this.previewElement,
        directoryToken: this.activeDirectoryToken,
        isCurrent: () => this.gate.isCurrent(update.generation)
      });
      if (!this.gate.isCurrent(update.generation)) return;
      this.previewElement.hidden = false;
      restoreScroll(scroll);
      this.setStatus("", "ready");
      if (result.warnings && result.warnings.length > 0) this.showWarning(result.warnings.join("; "));
      this.bridge.post(makeRenderCompleteMessage(update.generation));
    } catch (error) {
      if (!this.gate.isCurrent(update.generation)) return;
      const message = error instanceof Error ? error.message : "Preview could not be rendered";
      this.showWarning(message);
      this.setStatus("Preview error", "error");
      this.bridge.post(makeRenderErrorMessage(update.generation, message));
    }
  }

  public dispose(): void {
    this.registry.dispose();
    this.bridge.stop();
  }

  private setStatus(message: string, state: "loading" | "ready" | "error"): void {
    this.statusElement.textContent = message;
    this.statusElement.dataset.state = state;
    this.statusElement.hidden = state === "ready" && message.length === 0;
  }

  private showWarning(message: string): void {
    const warning = document.createElement("div");
    warning.className = "mpp-warning";
    warning.setAttribute("role", "alert");
    warning.textContent = message.slice(0, 1000);
    this.previewElement.prepend(warning);
  }

  private async copyValue(value: string, button: HTMLButtonElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    const original = button.textContent;
    button.textContent = "Copied";
    window.setTimeout(() => {
      button.textContent = original ?? "Copy";
    }, 1200);
  }
}

const shell = new ViewerShell(requiredElement<HTMLElement>("#status"), requiredElement<HTMLElement>("#preview"));
shell.start();

if (!window.chrome?.webview && new URLSearchParams(window.location.search).get("demo") === "1") {
  void shell.renderUpdate({
    type: "preview.update",
    protocolVersion: 2,
    generation: 1,
    bufferId: 1,
    formatHint: "markdown",
    file: { name: "demo.md", extension: ".md", saved: false },
    source: {
      kind: "text",
      text: "# Browser smoke test\n\nInline $x^2$\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n```plantuml\n@startuml\nAlice -> Bob: Hi\n@enduml\n```\n\n```javascript\nconst offline = true;\n```"
    },
    theme: "light",
    settings: defaultSettings()
  });
}

function defaultSettings() {
  return {
    showFrontMatter: true,
    showTableOfContents: true,
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
}

function captureScroll(): { top: number; ratio: number } {
  const documentElement = document.documentElement;
  const max = Math.max(1, documentElement.scrollHeight - window.innerHeight);
  return { top: window.scrollY, ratio: window.scrollY / max };
}

function restoreScroll(scroll: { top: number; ratio: number }): void {
  requestAnimationFrame(() => {
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({ top: Math.min(scroll.top, max) || scroll.ratio * max, behavior: "auto" });
  });
}
