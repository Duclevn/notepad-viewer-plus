import { RendererBridge, GenerationGate } from "../bridge/bridge";
import {
  makeRenderCompleteMessage,
  makeRenderErrorMessage,
  type DocumentUpdate
} from "../bridge/protocol";
import { DiagramRenderer } from "../diagrams/diagrams";
import { highlightCodeBlocks } from "../markdown/code";
import { renderMathPlaceholders } from "../markdown/math";
import { MarkdownPipeline } from "../markdown/pipeline";
import { applyResourcePolicy, bindResourceEvents } from "../security/resource-policy";
import "./styles.css";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Preview UI element is missing: ${selector}`);
  return element;
}

const statusElement = requiredElement<HTMLElement>("#status");
const previewElement = requiredElement<HTMLElement>("#preview");

const bridge = new RendererBridge();
const gate = new GenerationGate();
const pipeline = new MarkdownPipeline();
const diagramRenderer = new DiagramRenderer();
let activeToken: string | undefined;

bridge.subscribe((update) => {
  void renderUpdate(update);
});
bridge.start();
bindResourceEvents(previewElement, bridge, () => activeToken);
if (!window.chrome?.webview && new URLSearchParams(window.location.search).get("demo") === "1") {
  void renderUpdate({
    type: "document.update",
    protocolVersion: 1,
    generation: 1,
    bufferId: 1,
    theme: "light",
    text: "# Browser smoke test\n\nInline $x^2$\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n```plantuml\n@startuml\nAlice -> Bob: Hi\n@enduml\n```\n\n```javascript\nconst offline = true;\n```",
    settings: {
      showFrontMatter: true,
      showTableOfContents: true,
      rawHtml: true,
      remoteImages: false,
      mathAlternateDelimiters: true,
      codeWrapping: true
    }
  });
}
previewElement.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[data-copy-code]") : undefined;
  if (!target) return;
  const codeId = target.dataset.copyCode;
  const code = codeId ? previewElement.querySelector<HTMLElement>(`[data-mpp-code="${codeId}"] code`) : undefined;
  if (!code) return;
  void copyCode(code.textContent ?? "", target);
});

async function renderUpdate(update: DocumentUpdate): Promise<void> {
  if (!gate.accept(update.generation)) return;
  activeToken = update.documentDirectoryToken;
  document.documentElement.dataset.theme = update.theme;
  previewElement.classList.toggle("mpp-no-wrap", !update.settings.codeWrapping);
  setStatus("Rendering…", "loading");
  const scroll = captureScroll();

  try {
    const result = await pipeline.render(update);
    if (!gate.isCurrent(update.generation)) return;

    revokeDiagramUrls(previewElement);
    previewElement.innerHTML = result.html;
    applyResourcePolicy(previewElement, {
      documentDirectoryToken: activeToken,
      remoteImages: update.settings.remoteImages
    });
    previewElement.hidden = false;
    restoreScroll(scroll);
    setStatus("", "ready");

    const enhancementErrors: string[] = [];
    await Promise.all([
      result.math.length > 0
        ? renderMathPlaceholders(previewElement, result.math, () => gate.isCurrent(update.generation)).catch((error: unknown) => {
            enhancementErrors.push(error instanceof Error ? error.message : "Math renderer failed");
          })
        : Promise.resolve(),
      result.hasHighlightedCode
        ? highlightCodeBlocks(previewElement, () => gate.isCurrent(update.generation)).catch((error: unknown) => {
            enhancementErrors.push(error instanceof Error ? error.message : "Code highlighter failed");
          })
        : Promise.resolve(),
      result.diagrams.length > 0
        ? diagramRenderer.renderAll(previewElement, result.diagrams, {
            theme: update.theme,
            generation: update.generation,
            isCurrent: () => gate.isCurrent(update.generation)
          })
        : Promise.resolve()
    ]);

    if (!gate.isCurrent(update.generation)) return;
    if (enhancementErrors.length > 0) showWarning(enhancementErrors.join("; "));
    restoreScroll(scroll);
    bridge.post(makeRenderCompleteMessage(update.generation));
  } catch (error) {
    if (!gate.isCurrent(update.generation)) return;
    const message = error instanceof Error ? error.message : "Preview could not be rendered";
    showWarning(message);
    setStatus("Preview error", "error");
    bridge.post(makeRenderErrorMessage(update.generation, message));
  }
}

function setStatus(message: string, state: "loading" | "ready" | "error"): void {
  statusElement.textContent = message;
  statusElement.dataset.state = state;
  statusElement.hidden = state === "ready" && message.length === 0;
}

function showWarning(message: string): void {
  const warning = document.createElement("div");
  warning.className = "mpp-warning";
  warning.setAttribute("role", "alert");
  warning.textContent = message.slice(0, 1000);
  previewElement.prepend(warning);
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

function revokeDiagramUrls(root: ParentNode): void {
  for (const element of root.querySelectorAll<HTMLElement>("[data-mpp-object-url]")) {
    const url = element.dataset.mppObjectUrl;
    if (url) URL.revokeObjectURL(url);
    delete element.dataset.mppObjectUrl;
  }
}

async function copyCode(value: string, button: HTMLButtonElement): Promise<void> {
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

