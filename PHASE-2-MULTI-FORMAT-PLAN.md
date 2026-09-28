# Notepad Viewer Plus

## Product Phase 2 — Multi-format preview plan

**Status:** In progress
**Current product:** Markdown Preview Plus 0.1.5 baseline (tagged `v0.1.5`)
**Target product:** Notepad Viewer Plus 0.2.0
**Scope:** Offline, view-only previews inside the existing Notepad++ docked WebView2 panel

**Implementation checkpoint:** P2.0/P2.1 are implemented in the current working tree, with the low-risk P2.2/P2.3 viewers included behind the registry. HTML/OpenAPI and PDF require the remaining isolation/compatibility validation before release sign-off. The repository remains at its user-specified local path `markdown-preview-plus`; public binary, package, settings, and WebView identities use `NotepadViewerPlus`.

> This is product Phase 2. It is separate from the implementation phases in `PLAN-AND-ARCHITECTURE.md` that delivered the Markdown-only product.

## 1. Executive decision

The current architecture is suitable for this expansion, but it is not ready to add every format as another branch in the Markdown pipeline. Phase 2 should first turn the renderer into a format-dispatching viewer platform.

This is an incremental refactor, not a rewrite. The following foundations can be retained:

- Native Notepad++ docking and WebView2 lifecycle
- Debounced, generation-aware updates
- Versioned native/renderer bridge
- Offline Vite packaging and lazy chunks
- Theme handling and preview status UI
- Opaque local-resource tokens and canonical path checks
- HTML and SVG sanitization
- Existing Mermaid and PlantUML engines

The main gaps are:

- `document.update` carries only UTF-8 text and has no format/source model.
- `DocumentCoordinator` always snapshots Scintilla, which is unsuitable for PDF and image files.
- `app.ts` is coupled directly to `MarkdownPipeline`.
- The local resource response has no MIME type, content length, or HTTP range handling.
- The current 5 MiB text limit and bridge transport cannot be reused for typical PDFs or images.
- The CSP and navigation policy support the Markdown application only, not PDF workers or isolated HTML/OpenAPI viewers.

## 2. Target format support

| Format | Recognized inputs | Phase 2 viewer | Source mode |
|---|---|---|---|
| Markdown | `.md`, `.markdown`, `.mdown`, `.mkd` | Existing Markdown pipeline | Live Scintilla text |
| Mermaid | `.mmd`, `.mermaid` | Existing Mermaid engine through a standalone adapter | Live Scintilla text |
| PlantUML | `.puml`, `.plantuml`, `.pu`, `.iuml`, `.wsd` | Existing PlantUML engine through a standalone adapter | Live Scintilla text |
| HTML | `.html`, `.htm` | Sanitized static document in a scriptless sandbox | Live Scintilla text |
| SVG | `.svg` | SVG sanitizer, then Blob-backed `<img>` | Live Scintilla text |
| JSON | `.json` | Collapsible structured tree plus raw/error fallback | Live Scintilla text |
| YAML | `.yaml`, `.yml` | Collapsible structured tree plus raw/error fallback | Live Scintilla text |
| XML | `.xml` | Collapsible element/attribute tree plus raw/error fallback | Live Scintilla text |
| CSV/TSV | `.csv`, `.tsv`, optionally `.tab` | Bounded, virtualized table/grid | Live Scintilla text |
| OpenAPI | Content-detected JSON/YAML; optional `.openapi.json`, `.openapi.yaml`, `.swagger.json`, `.swagger.yaml` naming | Offline Swagger UI in read-only mode | Live Scintilla text |
| PDF | `.pdf` | Embedded local PDF viewer selected by a Phase 2 spike | Opaque native file resource |
| Images | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.ico`; `.avif` only after a WebView2 compatibility test | Browser image element with fit/actual-size/zoom controls | Opaque native file resource |

Unknown extensions continue to show a safe plain-text preview where possible. Binary content must never be pushed through the JSON text bridge.

## 3. Product behavior

### 3.1 Detection order

1. Obtain the active buffer ID, saved path, extension, and Scintilla code page.
2. Select text or binary source mode from an explicit extension table.
3. For JSON and YAML, parse safely and inspect the root object:
   - `openapi` identifies OpenAPI 3.x.
   - `swagger: "2.0"` identifies Swagger/OpenAPI 2.0.
4. A user override, such as `View as JSON` or `View as OpenAPI`, wins for the active buffer until it is closed.
5. If detection is ambiguous or parsing fails, use the generic format viewer and show a non-modal diagnostic.

Detection must not depend only on MIME types supplied by Windows, and content sniffing must be bounded.

### 3.2 Saved versus unsaved content

- Text viewers render the current Scintilla snapshot so unsaved edits appear immediately.
- Binary viewers read the exact active saved file through an opaque resource token.
- An unsaved buffer cannot be previewed as PDF or an image; show an actionable “save the file first” state.
- On save, rename, tab switch, or external file change, invalidate old resource tokens and increment the generation.

### 3.3 View-only guarantee

Phase 2 does not modify the Notepad++ document from the preview. In particular:

- Swagger UI “Try it out”, authorization, remote validation, and outgoing API requests are disabled.
- HTML scripts, forms, top-level navigation, popups, downloads, and remote subresources are disabled.
- SVG scripting and external references are removed.
- PDF support exposes viewing controls only; annotation/edit features are not part of the acceptance criteria.

## 4. Target architecture

```text
Notepad++ / Scintilla
        |
        v
DocumentCoordinator
  - active buffer/path metadata
  - text snapshot OR opaque file-resource registration
  - format hint and generation
        |
        v
Protocol v2: preview.update
        |
        v
Viewer shell (WebView2 application)
  - generation gate
  - format detection/override
  - status, errors, theme, scroll/zoom state
  - lazy ViewerRegistry dispatch
        |
        +-- MarkdownViewer
        +-- DiagramViewer (Mermaid / PlantUML)
        +-- StructuredDataViewer (JSON / YAML / XML)
        +-- DelimitedTextViewer (CSV / TSV)
        +-- HtmlViewer (scriptless sandbox)
        +-- SvgViewer (sanitize -> Blob image)
        +-- OpenApiViewer (sandboxed, read-only Swagger UI)
        +-- PdfViewer
        +-- ImageViewer
```

### 4.1 Protocol v2

Replace the Markdown-specific payload with a discriminated preview message. A representative shape is:

```ts
interface PreviewUpdate {
  type: "preview.update";
  protocolVersion: 2;
  generation: number;
  bufferId: number;
  formatHint: ViewerFormat;
  file: {
    name: string;
    extension: string;
    saved: boolean;
  };
  source:
    | { kind: "text"; text: string }
    | { kind: "resource"; token: string; url: string; size: number; mediaType: string };
  theme: Theme;
  settings: ViewerSettings;
}
```

Rules:

- Never expose an absolute path to JavaScript.
- Validate all fields and reject unknown protocol versions.
- Keep generation cancellation across every viewer.
- Apply separate configurable limits to text, structured data, CSV rows/columns, diagrams, images, and PDFs.
- Do not base64-encode binary files into bridge messages.
- Replace hand-written native JSON construction with a pinned, tested serializer before adding the nested protocol-v2 payload. Validate format IDs and media types against enums/allowlists on both sides.
- Cut over native and renderer components atomically to protocol v2; mixed v1/v2 assets are unsupported and must fail with an explicit protocol-mismatch state.

### 4.2 Viewer registry

Add a small registry rather than growing `app.ts`:

```ts
interface ViewerAdapter {
  id: ViewerFormat;
  canRender(context: PreviewContext): boolean;
  render(context: PreviewContext, root: HTMLElement): Promise<ViewerResult>;
  dispose(): void;
}
```

Each adapter owns parsing, rendering, cancellation, cleanup, state restoration, and errors for one format family. Heavy adapters are loaded with dynamic imports. The shell owns only dispatch, generation, status, theme, and cross-format controls.

### 4.3 Native resource service

Expand `ResourcePolicy` from “relative files under the document directory” to two explicit capabilities:

1. Directory-scoped resources for Markdown/HTML references.
2. Exact-file resources for the active PDF or image.

The resource response must provide an allowlisted media type, `Content-Length`, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff`. PDF delivery must support bounded `Range` requests and `206 Partial Content` if the selected viewer requires it. Exact-file tokens must be cryptographically random and bound to `(bufferId, generation, canonicalPath)`. Every request must match the currently active registry entry; revoke the entry on activation, save/rename, close, replacement, and shutdown. The request URL never supplies a filesystem path, and registration must reject non-regular files. Revalidate the binding when opening the file so a stale token cannot be reused after a path or buffer transition.

## 5. Viewer-specific decisions

### 5.1 Mermaid and PlantUML

Reuse `DiagramRenderer` and its serialized queue, cache, sandbox, SVG sanitizer, and generation checks. Add a standalone adapter that supplies the entire document as one diagram source instead of requiring a Markdown fence.

Acceptance includes valid rendering, inline syntax errors, stale-generation cancellation, light/dark themes, and zero network requests.

### 5.2 Images and SVG

Raster images use an exact-file resource URL and an `<img>` element. Add fit-to-window, actual size, zoom in/out, reset, and checkerboard/background controls.

SVG is not loaded as an active document. Read the current text, sanitize it, create a Blob URL, display it as an image, and revoke the URL on replacement. Keep the stricter diagram sanitizer unchanged and add a separate standalone-SVG policy. That policy may preserve `<image>` only for allowlisted raster `data:` URLs or constrained local references rewritten through the document resource service; remote/file URLs remain forbidden. Add fixtures for scripts, event handlers, `foreignObject`, external images, CSS URLs, oversized dimensions, and malformed XML.

### 5.3 JSON, YAML, and XML

Build one structured-data tree component with format-specific parsers. It should support expand/collapse, copy path/value, line wrapping, and a raw-source fallback.

Safety and performance limits:

- Reuse pinned `js-yaml` with `FAILSAFE_SCHEMA` and `json: true`; no custom constructors.
- No XML XSLT execution, external entities, or external DTD/resource resolution.
- Maximum input size, nesting depth, node count, string length, and rendered-node count.
- Incremental or virtual rendering for large collections.
- Parse errors include line/column when available and never hide the original text.

### 5.4 CSV and TSV

Use a pinned parser with RFC 4180-compatible quoting and a configurable delimiter. Prefer tab for `.tsv`; otherwise detect among a bounded delimiter set and show the detected choice.

The grid must virtualize rows, freeze the header, allow column resizing, and show row/column counts. Set explicit limits and provide a truncated-view warning instead of creating an unbounded DOM table. Formula-like cell values remain inert text.

### 5.5 HTML

Do not render untrusted HTML directly in the main application DOM. Use a dedicated sandboxed frame without `allow-same-origin`, forms, popups, downloads, or top navigation. Scripts are removed and not enabled by the sandbox.

Before this adapter is implemented, record a CSP/frame isolation ADR. It must define the main-shell and frame-specific policies separately, keep `connect-src 'none'`, avoid enabling Blob scripts, and allow only the minimum required `frame-src`/`worker-src` origins. Each frame gets its own restrictive CSP. Any sandboxed-frame message handler must verify `event.source === frame.contentWindow` and validate the message schema.

Phase 2 supports a safe static preview, not a full web browser. Relative images may use the existing constrained document-directory service. Remote resources remain disabled by default. CSS support requires its own sanitizer and resource-rewrite tests; if safe CSS is not ready, ship the first increment without author CSS rather than weakening CSP.

### 5.6 OpenAPI / Swagger

Use a pinned, locally bundled Swagger UI lazy chunk and pass an already parsed in-memory specification. Configure it for documentation only:

- `supportedSubmitMethods: []`
- `validatorUrl: null`
- No `configUrl`, remote definition URL, OAuth redirect, authorization persistence, or URL-query configuration
- No network access from the main page or sandbox
- Sanitize specification-provided Markdown/HTML

Support same-document `$ref` in the first increment. Before handing a spec to Swagger UI, recursively inspect every `$ref` and reject anything other than a same-document fragment; do not rely only on CSP/native blocking after Swagger tries to fetch it. Local multi-file `$ref` support may be added only through the constrained resource resolver with recursion, file-count, total-byte, and directory-bound limits. Remote `$ref` is out of scope.

Because ordinary `.json` and `.yaml` files can also be OpenAPI documents, content detection and a manual viewer override are required.

### 5.7 PDF

Run a focused spike before implementation:

- Option A: embed the Edge/WebView2 PDF viewer using an opaque `https://doc.local/` resource with correct PDF MIME and range responses.
- Option B: package PDF.js as a lazy viewer with local worker/font/map assets and a restricted toolbar.

Selection criteria are offline behavior, compatibility with the current navigation/resource policy, view-only controls, CSP changes, package size, large-file memory use, print/download behavior, and x64/Win32 smoke tests.

Prefer the built-in viewer if it works reliably without top-level navigation and without exposing a filesystem path. Select PDF.js if iframe behavior, policy control, or range handling is unreliable. Record the decision and measurements in a new ADR. The P2.1 CSP ADR must reserve this as an unresolved decision rather than pre-authorizing Blob workers; if PDF.js is selected, amend and re-approve the CSP ADR with an explicit local `worker-src` policy and regression tests before P2.5 ships.

## 6. Rename plan

Perform the product rename as the first controlled Phase 2 change, before format adapters are added.

### 6.1 Public identity

Rename these to `NotepadViewerPlus` / “Notepad Viewer Plus”:

- Repository folder: `markdown-preview-plus` -> `notepad-viewer-plus`
- CMake project, target, output DLL, package name, and ZIP name
- Notepad++ plugin display name, docking registration, module name, and resource strings
- Renderer package name, HTML title, UI text, README, architecture documents, fixtures, and packaging scripts
- `%LOCALAPPDATA%` WebView2 user-data directory
- Notepad++ configuration directory and INI filename
- Plugin Admin metadata and installation documentation

Use version `0.2.0` for the first renamed multi-format release.

### 6.2 Migration and compatibility

Before renaming, confirm whether Markdown Preview Plus has been published through Plugin Admin or distributed outside the local packages. If it has not been published, use a clean rename. If it has, document upgrade behavior and check Plugin Admin identity/rename constraints before changing the DLL identity.

On first run, load settings from `MarkdownPreviewPlus.ini` when the new settings file does not exist, then save them under the new name. Do not copy the old WebView2 browser-data directory; create a fresh directory. Rename the process-global preview window class. At startup, detect a loaded/installed legacy DLL where practical; if both identities are present, disable the new plugin with an actionable removal message rather than registering competing dock panels.

Internal C++ namespace names can be renamed separately after the public identity migration. Avoid mixing a mechanical namespace rename with protocol-v2 behavior changes in one review.

## 7. Delivery sequence

### P2.0 — Baseline, source control, and rename

**Hard prerequisite:** put the project under source control, commit the current passing state, and tag the 0.1.5 baseline before any rename. The current project root is not a Git working tree. A backup alone is not the default substitute for reviewable rename history.

1. Capture the passing 0.1.5 baseline and package hashes. *(Completed: repository initialized, baseline commit/tag `v0.1.5`, renderer tests/build and size report recorded.)*
2. Apply the public identity rename and settings migration. *(Completed for public binary/package/settings/WebView/window identities; the local workspace folder is retained.)*
3. Update `AGENTS.md`, build commands, package layout, size checker, licenses, and docs. *(In progress.)*
4. Build, test, install, and smoke-test the renamed Markdown-only plugin before adding new formats. *(Renderer/native build and tests pass; Notepad++ install smoke test remains environment-dependent.)*
5. Test clean install, settings migration, upgrade, uninstall, and a mixed old/new installation. *(Code paths added; manual install matrix remains.)*

**Exit criterion:** Notepad Viewer Plus 0.2.0-dev behaves exactly like Markdown Preview Plus 0.1.5 for Markdown; a mixed install is safely rejected; `AGENTS.md`, package layout, and build instructions consistently use the new identity. *(Automated protocol/native/renderer coverage is complete; manual Notepad++ smoke coverage is pending.)*

### P2.1 — Multi-format core

1. Introduce the native JSON serializer, protocol v2, atomic-cutover error handling, and native/TypeScript schema tests. *(Completed.)*
2. Add file metadata, format detection, source-mode selection, and manual override before snapshot creation; binary-mode buffers must never call `SCI_GETTEXT`. *(Completed.)*
3. Split the UI into `ViewerShell`, `ViewerRegistry`, and `MarkdownViewer`. *(Completed.)*
4. Add exact-file resource registration, active `(bufferId, generation)` checks, revocation, MIME allowlisting, and response headers. *(Completed, including bounded range responses.)*
5. Record the CSP/frame/worker isolation ADR and its required security regression matrix. *(ADR added; manual WebView2 validation remains.)*
6. Add per-format settings and limits. *(Completed for text, structured data, CSV, and binary resource limits.)*

**Exit criterion:** Markdown still passes all tests through the registry, and a test adapter proves text and resource source modes without leaking absolute paths. *(Completed by registry/viewer tests and protocol resource validation.)*

### P2.2 — Low-risk visual formats

1. Add standalone Mermaid and PlantUML adapters. *(Completed.)*
2. Add raster image viewer and controls. *(Completed.)*
3. Add sanitized SVG viewer. *(Completed.)*
4. Add fixtures and cancellation/security tests. *(Renderer security/cancellation coverage added; manual visual smoke remains.)*

**Exit criterion:** Diagram, image, and SVG files render offline; stale output and active SVG are impossible; all frame messages verify their source window and schema.

### P2.3 — Structured text and tabular data

1. Add JSON/YAML tree viewer. *(Completed.)*
2. Add XML tree viewer. *(Completed.)*
3. Add CSV/TSV parser and virtualized grid. *(Completed.)*
4. Add bounded parsing/rendering, diagnostics, and large-input tests. *(Completed for configured renderer limits; manual stress profiling remains.)*

**Exit criterion:** Representative and malformed files remain responsive, and configured size/node/row limits produce actionable warnings.

### P2.4 — Isolated document viewers

1. Add scriptless HTML sandbox and safe local-resource rewriting. *(Completed.)*
2. Add OpenAPI detection, pre-validation of every `$ref`, and the read-only locally bundled Swagger UI adapter. *(Completed; manual network/CSP smoke remains.)*
3. Implement the approved frame-specific CSP design, then validate sanitization, remote `$ref` rejection, and zero network activity without weakening Markdown protections. *(CSP/ADR and automated sanitization checks added; manual WebView2 validation remains.)*

**Exit criterion:** Hostile HTML/specification fixtures cannot execute code, navigate, submit requests, read arbitrary files, or access the network.

### P2.5 — PDF decision and implementation

1. Complete the built-in WebView2 versus PDF.js ADR. *(Spike decision remains pending supported-WebView2 smoke measurements.)*
2. Implement exact-file delivery, including ranges if required. *(Completed for bounded native 200/206/416 responses.)*
3. Add loading/error states, page/zoom controls available from the selected approach, and cleanup. *(Basic opaque iframe/error path completed; viewer compatibility validation remains.)*
4. Test encrypted, malformed, large, and externally linked PDFs. *(Pending manual PDF matrix.)*

**Exit criterion:** Saved PDFs render offline without exposing the path, freezing Notepad++, or allowing stale-file access.

### P2.6 — Hardening and release

1. Run renderer, native, protocol, security, and visual regression suites.
2. Test rapid editing, tab switches, Save As, file replacement, split views, Unicode paths, and unsaved buffers for every applicable format.
3. Test x64 and Win32 packages on supported Notepad++ and WebView2 versions.
4. Recalculate installed/ZIP/initial-load budgets and update third-party notices/SBOM.
5. Update syntax/format support, limitations, migration, and Plugin Admin documentation.

**Exit criterion:** All acceptance criteria pass and the measured size/performance changes are recorded.

## 8. Test matrix

Every viewer must cover:

- Valid minimal and representative files
- Empty input
- Malformed input with localized error display
- Maximum configured size and one-over-limit input
- Rapid generation replacement and disposal
- Light/dark/system themes
- Unicode content and paths
- Unsaved changes where supported
- No unexpected network requests
- No absolute path exposure in DOM, messages, or diagnostics
- Keyboard navigation and accessible labels

Additional mandatory cases:

- HTML/SVG: script, event handlers, external CSS/images, navigation, forms, and oversized markup
- OpenAPI: Try It Out disabled, remote validator disabled, remote/local recursive `$ref`, large schemas, hostile descriptions
- XML: DTD/entity/XSLT payloads and extreme nesting
- CSV/TSV: quoted newlines, escaped quotes, uneven rows, huge cells, and delimiter ambiguity
- PDF/image: replacement while loading, corrupt/truncated file, token revocation, unsupported codec, and large file

## 9. Size and performance budgets

The current validated renderer baseline is:

- Initial payload: 170,343 bytes raw / 67,196 bytes gzip
- Lazy payload: 8,641,678 bytes raw / 2,810,679 bytes gzip
- Installed renderer: 8.40 MiB
- Estimated renderer ZIP contribution: 2.81 MiB

Phase 2 must preserve an initial compressed payload below 250 KiB, with an intermediate goal of no more than 100 KiB after P2.4. Heavy viewers must remain lazy. P2.4 must report the Swagger UI lazy chunk separately; P2.5 must do the same for PDF.js if selected. Establish explicit per-chunk and revised installed/ZIP release budgets from those measurements; do not silently retain the old 7 MiB ZIP target if approved dependencies make it unrealistic.

Performance targets for representative files:

- Keep Notepad++ notification callbacks free of parsing and file reads.
- Coalesce updates with the existing debounce/generation mechanism.
- Commit a visible loading or base state within 100 ms after dispatch when feasible.
- Avoid constructing unbounded DOM trees or tables.
- Perform heavy parsing/rendering in an isolated frame or worker when measurements show main-renderer stalls.

## 10. Release acceptance criteria

Phase 2 is complete when:

1. The installed plugin and package are consistently named Notepad Viewer Plus.
2. Existing Markdown behavior and security tests remain green.
3. Every format in the target matrix has a documented extension, source mode, limits, fallback, and fixture.
4. Text formats reflect unsaved Scintilla edits; binary formats use only opaque saved-file resources.
5. OpenAPI is documentation-only and cannot issue API calls.
6. HTML and SVG cannot execute active content.
7. PDF and image paths are never exposed to renderer JavaScript.
8. All viewers obey generation cancellation and release resources on replacement.
9. Default operation is fully offline with zero unexpected requests.
10. x64 and Win32 release packages pass installation and smoke tests, with updated licenses and measured size reports.

## 11. Main risks

| Risk | Mitigation |
|---|---|
| One central renderer becomes a large conditional | Viewer registry with isolated lazy adapters |
| Binary files are copied through JSON or Scintilla | Exact-file native resource mode |
| HTML/SVG introduces active-content execution | Scriptless sandbox, sanitization, strict CSP and native request blocking |
| Swagger UI sends requests or loads remote references | Read-only configuration, in-memory spec, no validator/config URL, blocked network |
| PDF viewer conflicts with current navigation policy | Time-boxed built-in/PDF.js spike and ADR before implementation |
| Large JSON/XML/CSV freezes WebView2 | Parser limits, virtualization, workers/frames based on profiling |
| Rename leaves duplicate plugin/config identities | Rename inventory, settings migration, clean-install/upgrade tests |
| Package size grows unexpectedly | Lazy chunks, strict size report, revised explicit budget |

## 12. References

- Existing architecture: `PLAN-AND-ARCHITECTURE.md`
- Existing security model: `docs/security-model.md`
- Existing Phase 0 measurements: `docs/architecture-decisions/ADR-0001-phase0.md`
- Microsoft WebView2 local content: <https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/working-with-local-content>
- Microsoft WebView2 custom resource handling: <https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/webresourcerequested>
- Swagger UI installation: <https://swagger.io/docs/open-source-tools/swagger-ui/usage/installation/>
- Swagger UI configuration: <https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/>
