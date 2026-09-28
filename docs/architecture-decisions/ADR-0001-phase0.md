# ADR-0001: Phase 0 renderer spikes

**Status:** Accepted for the MVP scaffold

## Decision

Use the planned split renderer architecture:

- Markdown-it and DOMPurify remain in the initial bundle.
- YAML, Highlight.js grammars, and KaTeX are lazy.
- Mermaid Tiny is packaged as a local classic script and executed inside a sandboxed diagram frame.
- PlantUML and Viz.js are lazy-loaded by the sandboxed diagram frame and rendered through the callback API. Diagram requests are processed sequentially by the parent renderer.
- KaTeX is rendered in a separate sandboxed frame. The production page keeps `style-src 'self'`; generated diagram/math styles never enter the main DOM.
- Diagram output is sanitized in the parent before conversion to a Blob-backed `<img>`.

The opaque-origin sandbox frames require CORS access to packaged assets. The native host therefore maps the packaged application origin with `COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW_CORS`, while navigation and all non-packaged resource requests remain blocked by the native policy.

## Measurements

Measured from `renderer/dist` after `npm run build`:

| Measurement | Result | Budget |
|---|---:|---:|
| Initial payload, raw | 158,361 bytes | < 500 KiB compressed target |
| Initial payload, gzip estimate | 63,608 bytes | 750 KiB warning |
| Lazy payload, raw | 8,640,087 bytes | included in installed package |
| Installed renderer assets | 8,798,448 bytes / 8.39 MiB | 20 MiB warning |
| ZIP estimate (gzip sum + metadata) | 2,939,079 bytes / 2.80 MiB | 7 MiB target, 8 MiB warning |

PlantUML and Viz.js are the largest assets. Mermaid Tiny is shipped once as `vendor/mermaid-tiny.js`. The KaTeX frame emits 20 WOFF2 font assets and no WOFF, TTF, or data-URL font copies.

## Validation evidence

- `npm run lint`: passed.
- `npm test`: 12 renderer/security/protocol tests passed.
- `npm run build`: passed.
- Playwright production smoke page (`?demo=1`) rendered one Mermaid diagram, one PlantUML diagram, KaTeX math, and a highlighted JavaScript fence.
- The smoke page had zero `SecurityPolicyViolationEvent` events after generated styles were removed from the main DOM and the diagram/math frame boundaries were added.
- The smoke page made no requests outside the local packaged origin and Blob URLs.
- The inspected `@plantuml/core@1.2026.8` package declares MIT licensing; the generated inventory is in `packaging/THIRD-PARTY-LICENSES.txt`.

The browser smoke uses a local static server solely for validation. It does not change the runtime architecture: the shipped plugin uses WebView2 virtual-host mapping and has no HTTP server.

## Remaining validation

Native WebView2 lifecycle, docking, local-file response handling, and x64/Win32 compilation require the Windows Notepad++ SDK, WebView2 SDK, and Visual Studio toolchain. They cannot be compiled in the current environment because `cmake`, `cl`, and `msbuild` are unavailable. These are Phase 1/4 build-agent gates, not silently treated as passed here.
