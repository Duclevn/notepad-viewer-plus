# Markdown Preview Plus

## Purpose

Markdown Preview Plus is a Windows Notepad++ plugin with an offline, docked Markdown preview. The native C++ layer owns Notepad++ integration and WebView2 hosting; the TypeScript renderer owns Markdown parsing, sanitization, syntax support, and diagram rendering.

## Architecture and ownership

- `native/`: C++17 Win32/Notepad++ shell, document coordination, WebView2 lifecycle, message validation, resource policy, and settings.
- `renderer/`: TypeScript/Vite renderer. Keep rendering, table-of-contents generation, and untrusted-content handling in the WebView2 renderer process.
- `tests/`: native regression tests and Markdown/image fixtures used by integration smoke tests; renderer unit/security tests live under `renderer/tests/`.
- `docs/`: user-facing syntax/security documentation and implementation decisions.
- `packaging/`: release manifests, size checks, and third-party license inventory.
- `CMakeLists.txt`: native build entry point; a Visual Studio C++/CMake environment is required for the native target.

## Invariants

- Runtime operation is offline by default: no CDN, local HTTP server, PlantUML server, or remote include. An explicit remote-image setting may allow HTTPS image requests only.
- Every host-to-renderer update carries a protocol version and monotonically increasing generation. Stale render results must not replace newer content.
- Treat Markdown, raw HTML, URLs, local paths, and generated SVG as untrusted. Sanitize ordinary HTML and diagram SVG separately.
- Keep absolute filesystem paths in the native layer. Renderer resource URLs must be constrained and opaque.
- WebView2 navigation and unexpected network requests are blocked; only explicitly permitted external links leave through the system browser, and the optional HTTPS-image mode is passed through the native policy.
- All diagram render operations are serialized across generations, and Mermaid/PlantUML output is sanitized before display.
- Do not perform parsing or rendering in Notepad++ notification callbacks.
- Keep a newly installed preview hidden. Honor Notepad++ dock-state restoration, refresh immediately whenever the panel becomes visible, and let `NPPM_DMMSHOW`/`NPPM_DMMHIDE` own docked-window visibility so the closed state persists.
- Do not add the GPL PlantUML site/demo build or unpinned runtime dependencies.

## Development commands

From `renderer/`:

- `npm ci` — install the locked renderer dependencies.
- `npm run build` — build the production renderer and lazy chunks.
- `npm test` — run renderer unit/security tests.
- `npm run test:watch` — run tests interactively.
- `npm run lint` — run TypeScript checks/linting.

From the repository root:

- `cmake -S . -B build -G "Visual Studio 17 2022" -A x64 -DNPP_SDK_DIR="third_party/npp-plugin-template" -DWEBVIEW2_SDK_DIR="third_party/Microsoft.Web.WebView2"`
- `cmake --build build --config Release`
- `ctest --test-dir build -C Release --output-on-failure`
- `cpack --config build/CPackConfig.cmake -C Release`

This Windows development environment has CMake, Visual Studio 2022 Build Tools, the Notepad++ plugin template SDK, and the WebView2 SDK. Validate the native tests and renderer checks before packaging.

## Packaging and validation

- `npm run build` must emit only packaged runtime assets under `renderer/dist`.
- `packaging/check-size.mjs` reports initial/lazy chunk sizes, required assets, optional ZIP size, and release-size thresholds; use `npm run size:strict` in CI. CPack creates the root-DLL ZIP, and `packaging/plugin-admin/generate-entry.mjs` calculates its SHA-256 manifest entry.
- Regenerate `packaging/THIRD-PARTY-LICENSES.txt` with `npm run licenses` and update `docs/third-party-licenses.md` whenever runtime dependencies change. The generator includes all non-development lockfile packages.
- Release x64 and Win32 packages separately with CPack. The Plugin Admin ZIP must keep `MarkdownPreviewPlus.dll` at the archive root and must not include the WebView2 Evergreen Runtime.

## Maintenance conventions

- Pin dependency versions in `renderer/package-lock.json`.
- Prefer small, testable modules over code in the UI entry point.
- Add a regression fixture/test for each security or generation-cancellation fix.
- Keep the plan's phase status and documented limitations current when implementation decisions change.
