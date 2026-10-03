const copyValueFactories = new WeakMap<HTMLButtonElement, () => string>();

/** Associates a copy button with a lazily-created value while retaining the delegated-click marker. */
export function registerCopyValue(button: HTMLButtonElement, factory: () => string): void {
  copyValueFactories.set(button, factory);
  button.dataset.mppCopyValue = "";
}

/** Resolves a registered value only when the delegated copy handler needs it. */
export function getCopyValue(button: HTMLButtonElement): string | undefined {
  const factory = copyValueFactories.get(button);
  return factory ? factory() : undefined;
}
