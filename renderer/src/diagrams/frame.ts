import { renderPlantUmlToString, type PlantUmlApi } from "./plantuml-render";

export {};

interface FrameRequest {
  type: "render";
  id: string;
  engine: "mermaid" | "plantuml";
  source: string;
  theme: "light" | "dark";
}

interface MermaidApi {
  initialize(options: Record<string, unknown>): void;
  render(id: string, source: string): Promise<{ svg: string }>;
}

declare global {
  var mermaid: MermaidApi | undefined;
}

let mermaidPromise: Promise<MermaidApi> | undefined;
let plantUmlPromise: Promise<PlantUmlApi> | undefined;
let mermaidTheme: "light" | "dark" | undefined;

interface PendingRender {
  request: FrameRequest;
  port: MessagePort;
}

let pendingRender: PendingRender | undefined;
let rendering = false;

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window.parent || !event.ports[0] || !isFrameRequest(event.data)) return;
  const port = event.ports[0];
  // The parent may supersede a queued generation while the current engine call
  // is still running. Keep one latest pending job so the engines never overlap.
  if (pendingRender) {
    try {
      sendResponse(pendingRender.port, { ok: false, message: "Diagram render superseded by a newer document" });
    } finally {
      pendingRender.port.close();
    }
  }
  pendingRender = { request: event.data, port };
  void drainRenderQueue();
});

window.parent.postMessage({ type: "diagram-frame.ready" }, "*");

function isFrameRequest(value: unknown): value is FrameRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return (
    request.type === "render" &&
    typeof request.id === "string" && request.id.length <= 128 &&
    (request.engine === "mermaid" || request.engine === "plantuml") &&
    typeof request.source === "string" && request.source.length <= 200_000 &&
    (request.theme === "light" || request.theme === "dark")
  );
}

async function render(request: FrameRequest): Promise<string> {
  let svg: string;
  if (request.engine === "plantuml") {
    if (/^\s*!include[^\r\n]*$/imu.test(request.source)) throw new Error("PlantUML includes are disabled in offline preview");
    const plantUml = await loadPlantUml();
    svg = await renderPlantUmlToString(plantUml, request.source, request.id, request.theme === "dark");
  } else {
    const mermaid = await loadMermaid();
    if (mermaidTheme !== request.theme) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        htmlLabels: false,
        theme: request.theme === "dark" ? "dark" : "default",
        suppressErrorRendering: true
      });
      mermaidTheme = request.theme;
    }
    svg = (await mermaid.render(request.id.replace(/[^a-zA-Z0-9_-]/gu, "-"), request.source)).svg;
  }
  return materializeSvgPresentation(svg);
}

async function drainRenderQueue(): Promise<void> {
  if (rendering) return;
  rendering = true;
  try {
    while (pendingRender) {
      const job = pendingRender;
      pendingRender = undefined;
      try {
        const svg = await render(job.request);
        sendResponse(job.port, { ok: true, svg });
      } catch (error) {
        sendResponse(job.port, { ok: false, message: error instanceof Error ? error.message : "Diagram rendering failed" });
      } finally {
        job.port.close();
      }
    }
  } finally {
    rendering = false;
  }
}

function sendResponse(port: MessagePort, response: { ok: boolean; svg?: string; message?: string }): void {
  try {
    port.postMessage(response);
  } catch {
    // The parent closes superseded ports as soon as a newer generation arrives.
  }
}

function materializeSvgPresentation(source: string): string {
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg") {
    throw new Error("Diagram renderer produced invalid SVG");
  }
  const svg = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "-10000px";
  host.appendChild(svg);
  document.body.appendChild(host);

  const properties = [
    "alignment-baseline", "color", "dominant-baseline", "fill", "fill-opacity", "fill-rule", "font-family",
    "font-size", "font-style", "font-weight", "opacity", "shape-rendering", "stroke", "stroke-dasharray",
    "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "stroke-width",
    "text-anchor", "visibility"
  ];
  try {
    for (const element of [svg, ...Array.from(svg.querySelectorAll<SVGElement>("*"))]) {
      const computed = getComputedStyle(element);
      for (const property of properties) {
        const value = computed.getPropertyValue(property).trim();
        if (value && !/url\s*\(/iu.test(value)) element.setAttribute(property, value);
      }
      element.removeAttribute("style");
    }
    for (const style of svg.querySelectorAll("style")) style.remove();
    return new XMLSerializer().serializeToString(svg);
  } finally {
    host.remove();
  }
}

function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = new Promise<MermaidApi>((resolve, reject) => {
      if (globalThis.mermaid) {
        resolve(globalThis.mermaid);
        return;
      }
      const script = document.createElement("script");
      script.src = new URL("vendor/mermaid-tiny.js", document.baseURI).toString();
      script.onload = () => globalThis.mermaid ? resolve(globalThis.mermaid) : reject(new Error("Mermaid Tiny API unavailable"));
      script.onerror = () => reject(new Error("Mermaid Tiny could not be loaded"));
      document.head.appendChild(script);
    });
  }
  return mermaidPromise;
}

function loadPlantUml(): Promise<PlantUmlApi> {
  if (!plantUmlPromise) {
    plantUmlPromise = (async () => {
      await import("@plantuml/core/viz-global.js");
      const module = await import("@plantuml/core/plantuml.js");
      if (typeof module.render !== "function") throw new Error("PlantUML runtime has no render API");
      return module as unknown as PlantUmlApi;
    })();
  }
  return plantUmlPromise;
}
