# Format and syntax support

Notepad Viewer Plus renders supported content locally inside the docked WebView2 panel. Runtime operation is offline by default: there is no CDN, local HTTP server, PlantUML server, or remote OpenAPI definition.

## Format dispatch

| Input | Viewer | Source mode |
|---|---|---|
| `.md`, `.markdown`, `.mdown`, `.mkd` | Markdown pipeline | Live Scintilla text |
| `.mmd`, `.mermaid` | Standalone Mermaid | Live Scintilla text |
| `.puml`, `.plantuml`, `.pu`, `.iuml`, `.wsd` | Standalone PlantUML | Live Scintilla text |
| `.html`, `.htm` | Scriptless HTML sandbox | Live Scintilla text |
| `.svg` | Sanitized Blob-backed image | Live Scintilla text |
| `.json`, `.yaml`, `.yml`, `.xml` | Bounded collapsible tree, raw fallback | Live Scintilla text |
| `.csv`, `.tsv`, `.tab` | Bounded virtualized grid | Live Scintilla text |
| JSON/YAML with `openapi` or `swagger: "2.0"` | Documentation-only OpenAPI view | Live Scintilla text |
| `.pdf` | Opaque local PDF resource viewer | Saved file only |
| `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.ico`, `.avif` | Image viewer with fit/actual-size/zoom | Saved file only |
| Other extensions | Safe plain-text fallback | Live Scintilla text |

A manual format override is carried by protocol v2 settings and applies until the active buffer is closed. Unknown or invalid overrides fall back safely. JSON/YAML OpenAPI detection occurs after bounded parsing.

## Theme behavior

Light, dark, and system themes apply to viewer-owned UI. System mode is resolved against the current Windows color preference and is refreshed when that preference changes. Markdown, plain text, structured-data trees, and CSV/TSV grids use native application colors; Mermaid, PlantUML, KaTeX, and code highlighting receive an effective light/dark theme.

Authored or third-party formats are not color-inverted. Swagger UI uses a light compatibility surface in dark mode, sanitized HTML always uses an explicit light document canvas, and PDF pages retain the rendering chosen by the WebView2 PDF viewer. Standalone SVG and raster-image viewers provide Light, Dark, and Grid background controls; SVG defaults to Light and raster images default to Grid so transparent content remains inspectable.

## Markdown

Common Markdown is parsed by Markdown-it. YAML front matter is recognized only at the start of the document, with an optional UTF-8 BOM. It uses a non-constructing YAML schema and is shown as bounded metadata. Raw HTML is enabled by default but passed through an allowlist sanitizer; the setting can disable raw HTML.

Relative images and links use an opaque native directory token and are served only after canonical-path validation inside the current document directory. Remote images are disabled by default; the opt-in mode permits HTTPS images only.

Markdown headings receive safe anchor IDs and a bounded table of contents (maximum 500 headings). The top-right list button opens the TOC in a right-side panel and toggles it without re-rendering the document. **Plugins → Notepad Viewer Plus → Toggle Table of Contents** controls the initial panel state for the active document. The renderer does not inject a second in-document TOC; any visible heading/list TOC in the document is authored Markdown content.

## Diagrams and math

- `plantuml` and `puml` fences use the bundled MIT `@plantuml/core` runtime. Remote and arbitrary local `!include` directives are disabled.
- `mermaid` fences use the bundled Mermaid Tiny runtime. Mermaid Tiny does not include mindmaps, architecture diagrams, ELK layouts, or Mermaid's internal KaTeX integration.
- Standalone Mermaid and PlantUML files are rendered as one diagram source.
- `$...$`, `$$...$$`, and optional `\(...\)`/`\[...\]` delimiters use KaTeX with `trust: false`, bounded expansion, and local WOFF2 fonts. `math` fences are also supported.

## Structured and tabular data

JSON, YAML, and XML trees support expand/collapse, copy path/value, line wrapping, and a raw-source fallback. Input size, depth, node count, string length, and rendered nodes are bounded. XML DTD/entity declarations and external resolution are rejected.

CSV/TSV parsing supports RFC 4180-style quoted fields, escaped quotes, quoted newlines, delimiter detection, uneven rows, frozen headers, and a virtualized viewport. Formula-like values are inert text. Row, column, cell, and input limits produce a visible truncation warning.

## HTML, SVG, and OpenAPI

HTML is sanitized before being placed in an iframe with an empty sandbox and a restrictive frame CSP. Scripts, forms, popups, downloads, top navigation, external subresources, and author CSS are not supported.

Standalone SVG is never inserted as active SVG in the application DOM. Scripts, event attributes, `foreignObject`, external references, CSS URLs, and unsafe image references are removed; the result is displayed through a Blob-backed image and revoked on replacement. Its background selector changes only the viewer artboard and never rewrites SVG colors.

OpenAPI/Swagger is documentation-only through a pinned, locally bundled lazy Swagger UI chunk. `Try it out`, authorization, validators, remote config/definition URLs, OAuth redirects, and outgoing requests are disabled. Every `$ref` must be a same-document fragment; remote and cross-file references are rejected before rendering. A safe local summary fallback is used if the lazy chunk cannot load.

## Binary viewers and limits

PDF and raster image bytes are delivered through an exact-file token bound to the active `(bufferId, generation, canonicalPath)`. Paths are never sent to JavaScript, binary bytes are never base64-encoded into bridge messages, and an unsaved binary buffer shows a save-first diagnostic. PDF range delivery is bounded and view-only controls are limited by the selected WebView2 viewer.

The WebView2 Evergreen Runtime and a matching x64 or Win32 plugin package are required. Preview export, editing, and source/preview scroll synchronization are not included.
