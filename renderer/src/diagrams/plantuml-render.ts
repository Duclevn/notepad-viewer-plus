export interface PlantUmlApi {
  render(lines: string[], targetId: string, options?: { dark?: boolean }): void;
}

export function renderPlantUmlToString(
  plantUml: PlantUmlApi,
  source: string,
  requestId: string,
  dark: boolean,
  timeoutMs = 25_000
): Promise<string> {
  const target = document.createElement("div");
  target.id = `mpp-plantuml-${requestId.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
  target.hidden = true;
  target.setAttribute("aria-hidden", "true");
  document.body.appendChild(target);

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (result: { svg?: string; error?: Error }): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      observer.disconnect();
      target.remove();
      if (result.svg) resolve(result.svg);
      else reject(result.error ?? new Error("PlantUML produced no SVG output"));
    };
    const collectSvg = (): void => {
      const svg = target.querySelector<SVGSVGElement>("svg");
      if (svg) finish({ svg: svg.outerHTML });
    };
    const observer = new MutationObserver(collectSvg);
    const timeout = window.setTimeout(() => finish({ error: new Error("PlantUML renderer timed out") }), timeoutMs);
    observer.observe(target, { childList: true, subtree: true });

    try {
      plantUml.render(source.split(/\r?\n/u), target.id, { dark });
      collectSvg();
    } catch (error) {
      finish({ error: error instanceof Error ? error : new Error(String(error)) });
    }
  });
}
