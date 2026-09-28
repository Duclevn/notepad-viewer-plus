# Security model

Markdown Preview Plus treats the Markdown document and every generated diagram as untrusted input.

## Renderer boundary

- Host messages are schema-checked, protocol-versioned, and bounded to 5 MiB of UTF-8 document text.
- Updates carry a monotonically increasing generation. Older asynchronous math, highlighting, or diagram results cannot replace a newer generation.
- The WebView2 page is hosted at `https://app.local/`. Navigation and unexpected requests are blocked by the native host.
- The page CSP uses `default-src 'none'`, local script/style/font sources, `connect-src 'none'`, and no object, form, or base support. The `https:` image source is usable only after the renderer's explicit remote-image setting preserves an HTTPS image; the default resource policy removes remote images.

## HTML and SVG

Markdown HTML is sanitized with an explicit tag/attribute allowlist. Scripts, event attributes, frames, forms, objects, embeds, author styles, `srcdoc`, and unsafe URL protocols are removed.

Mermaid and PlantUML output follows a separate policy:

1. The SVG string is sanitized with an SVG-specific policy.
2. Scripts, event attributes, external references, `foreignObject`, embedded images, and unsafe links are removed. Generated layout styles are retained only after external CSS URLs and import/font rules are stripped.
3. The result is displayed through a Blob-backed `<img>`, not inserted as live SVG in the main DOM.
4. Blob URLs are revoked when the preview is replaced.

## Files and links

The renderer receives an opaque directory token, never an absolute filesystem path. Relative image and link paths are rejected if they are absolute, use a scheme, contain traversal segments, or escape the canonical document directory. Native code resolves the token and path with `weakly_canonical` and checks the directory prefix before serving or opening a file.

Only HTTP and HTTPS links are offered to the system browser. `javascript:`, `file:`, unknown schemes, HTTP images, and remote images when the setting is off are blocked. Opt-in remote images are HTTPS-only.

## Offline invariant

The production renderer packages Markdown-it, DOMPurify, KaTeX, Highlight.js grammars, Mermaid Tiny, PlantUML, CSS, and fonts locally. The default renderer makes no network requests. If remote images are explicitly enabled, only HTTPS image requests are permitted; all other non-packaged requests remain blocked. PlantUML remote includes and arbitrary standard-library downloads are rejected.
