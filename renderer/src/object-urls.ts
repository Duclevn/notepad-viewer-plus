const OBJECT_URL_ATTRIBUTE = "data-mpp-object-url";

const ownedUrls = new Set<string>();

/**
 * Creates an object URL owned by the renderer shell.
 *
 * Keeping ownership here makes root replacement and shutdown deterministic even
 * when the element that displays a URL has already been detached.
 */
export function createOwnedObjectUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  ownedUrls.add(url);
  return url;
}

export function trackOwnedObjectUrl(element: HTMLElement, url: string): void {
  const previous = element.dataset.mppObjectUrl;
  if (previous && previous !== url) revokeOwnedObjectUrl(previous);
  ownedUrls.add(url);
  element.dataset.mppObjectUrl = url;
}

export function revokeOwnedObjectUrl(url: string | undefined): void {
  if (!url || !ownedUrls.delete(url)) return;
  URL.revokeObjectURL(url);
}

/** Revokes URLs marked below a root, including a root element carrying a marker. */
export function releaseOwnedObjectUrls(root: ParentNode): void {
  const elements: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.dataset.mppObjectUrl) elements.push(root);
  elements.push(...Array.from(root.querySelectorAll<HTMLElement>(`[${OBJECT_URL_ATTRIBUTE}]`)));
  for (const element of elements) {
    const url = element.dataset.mppObjectUrl;
    delete element.dataset.mppObjectUrl;
    revokeOwnedObjectUrl(url);
  }
}

/** Revokes every URL still owned by the current renderer shell. */
export function releaseAllOwnedObjectUrls(): void {
  for (const url of Array.from(ownedUrls)) revokeOwnedObjectUrl(url);
}

/** Exposed for focused lifecycle tests without exposing mutable ownership state. */
export function ownedObjectUrlCount(): number {
  return ownedUrls.size;
}
