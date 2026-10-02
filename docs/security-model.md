# Security model

Notepad Viewer Plus treats every document, file name, URL, parsed value, generated diagram, and specification description as untrusted input.

## Native/renderer boundary

- Host messages use protocol v2, a discriminated `preview.update` schema, allowlisted format/media IDs, bounded settings, and bounded UTF-8 text.
- Updates carry a monotonically increasing generation. Older asynchronous math, highlighting, diagram, viewer, and Blob results cannot replace a newer generation.
- Text is carried as a text source. PDF/image data is carried only as an opaque exact-file resource descriptor; bytes are never base64-encoded into the JSON bridge and binary buffers never call `SCI_GETTEXT`.
- The renderer receives only the file name/extension and opaque tokens. Absolute filesystem paths remain native-only.
- Protocol cutover is atomic: unknown versions are rejected and the native panel reports an actionable mismatch instead of guessing a schema.

## WebView2 and CSP

The page is hosted at `https://app.local/`. Native navigation and web-resource interception allow packaged assets, currently active constrained resources, and explicitly enabled HTTPS images only. Unexpected HTTP(S), WebSocket, file, localhost, and top-level navigation requests are blocked.

The main CSP uses `default-src 'none'`, local script/style/font sources, `connect-src 'none'`, no objects/forms/base, no worker source, and only the required `frame-src` values. `img-src` includes the valid `https:` scheme so the explicit remote-image mode can work, but renderer sanitization and the native WebView2 request handler both block HTTPS images by default. HTML receives a separate frame CSP and an empty iframe sandbox; it has no scripts, same-origin access, forms, popups, downloads, top navigation, or author CSS. PDF is the exception: the built-in WebView2 PDF viewer requires an unsandboxed iframe, so it is loaded only from the active exact-file `https://doc.local/file/<token>` URL. `doc.local` is a separate origin from the app, the native frame/resource policy remains authoritative, and the PDF frame has no renderer message channel. See [`ADR-0002-phase2-isolation.md`](architecture-decisions/ADR-0002-phase2-isolation.md).

## HTML, SVG, and OpenAPI

Markdown HTML is sanitized with an explicit tag/attribute allowlist. Scripts, event attributes, frames, forms, objects, embeds, author styles, `srcdoc`, and unsafe URL protocols are removed.

Standalone SVG and generated diagram SVG use separate policies. The sandboxed diagram frame has an opaque origin; its `postMessage` target is therefore `*`, but the parent checks the source window and uses a transferred, per-render `MessagePort` for responses.

1. The SVG string is parsed and sanitized before display.
2. Scripts, event attributes, external references, `foreignObject`, unsafe CSS URLs, and remote images are removed. Standalone SVG may retain only allowlisted raster data images.
3. The safe result is displayed through a Blob-backed `<img>`, not inserted as active SVG in the main DOM.
4. Blob URLs are revoked when the preview is replaced or disposed.

OpenAPI/Swagger uses a pinned local lazy UI bundle in documentation-only mode. The renderer recursively rejects every `$ref` that is not a same-document fragment before rendering. No validator URL, config URL, remote definition, OAuth redirect, authorization persistence, Try It Out operation, or network request is configured. Specification descriptions are sanitized before insertion, and a safe local fallback is used if the lazy chunk fails.

## Resource policy and lifecycle

Directory resources use a constrained opaque token and native canonical-path checks. Exact PDF/image resources use a cryptographically random token bound to `(bufferId, generation, canonicalPath, size, mediaType)`. Registration rejects non-regular files and non-allowlisted media types. Every request must match the active binding; save/rename/activation/replacement/close/shutdown revokes stale exact entries. Files are revalidated at open time, served with `Content-Length`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and allowlisted `Content-Type`. Single bounded byte ranges return `206`; invalid ranges return `416`.

Relative image/link paths are rejected if absolute, scheme-bearing, traversal-containing, or outside the canonical document directory. Only HTTP/HTTPS links are offered to the system browser. `javascript:`, `file:`, unknown schemes, HTTP images, and remote images when the setting is off are blocked. The native About dialog validates its hyperlink against the exact `https://ducle.uk` target before calling `ShellExecuteW`; it does not accept renderer-provided URLs.

## Offline invariant

The production renderer packages all runtime dependencies, CSS, fonts, Mermaid Tiny, and PlantUML locally. The default renderer makes no network requests. PlantUML remote includes and arbitrary standard-library downloads are rejected. The built-in WebView2 PDF path still requires manual compatibility smoke testing before release sign-off, including range requests and replacement/revocation behavior.
