export type ArtboardMode = "light" | "dark" | "checkerboard";

const MODES: ReadonlyArray<{ mode: ArtboardMode; label: string }> = [
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
  { mode: "checkerboard", label: "Grid" }
];

export function setArtboardMode(element: HTMLElement, mode: ArtboardMode): void {
  for (const item of MODES) element.classList.toggle(`mpp-artboard-${item.mode}`, item.mode === mode);
  element.dataset.mppArtboard = mode;
}

export function createArtboardControls(element: HTMLElement, initialMode: ArtboardMode): HTMLElement {
  setArtboardMode(element, initialMode);
  const controls = document.createElement("span");
  controls.className = "mpp-artboard-controls";
  const label = document.createElement("span");
  label.className = "mpp-artboard-label";
  label.textContent = "Background";
  controls.appendChild(label);

  for (const item of MODES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mpp-viewer-button mpp-artboard-button";
    button.textContent = item.label;
    button.dataset.mppArtboardMode = item.mode;
    button.setAttribute("aria-pressed", String(item.mode === initialMode));
    button.addEventListener("click", () => {
      setArtboardMode(element, item.mode);
      for (const sibling of controls.querySelectorAll<HTMLButtonElement>("button[data-mpp-artboard-mode]")) {
        sibling.setAttribute("aria-pressed", String(sibling === button));
      }
    });
    controls.appendChild(button);
  }
  return controls;
}
