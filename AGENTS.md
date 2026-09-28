# Notepad Viewer Plus

## Purpose

Notepad Viewer Plus is a Windows Notepad++ plugin with an offline, docked multi-format preview. The native C++ layer owns Notepad++ integration, WebView2 hosting, protocol-v2 serialization, document/resource coordination, and exact-file security; the TypeScript renderer owns format dispatch, parsing, sanitization, syntax support, and viewer rendering.

## Architecture and ownership

- `native/`: C++17 Win32/Notepad++ shell, document coordination, WebView2 lifecycle, protocol-v2 serializer/validation, resource policy, exact-file tokens, and settings.
- `renderer/`: TypeScript/Vite viewer shell and registry. Keep rendering, table-of-contents generation, structured-data limits, and untrusted-content handling in the WebView2 renderer process.
- `tests/`: native regression tests and format/security fixtures used by integration smoke tests; renderer unit/security tests live under `renderer/tests/`.
- `docs/`: user-facing syntax/security documentation and implementation decisions.
- `packaging/`: release manifests, size checks, and third-party license inventory.
- `CMakeLists.txt`: native build entry point; a Visual Studio C++/CMake environment is required for the native target.

## Invariants

- Runtime operation is offline by default: no CDN, local HTTP server, PlantUML server, remote include, Swagger definition URL, or remote `$ref`. An explicit remote-image setting may allow HTTPS image requests only.
- Every host-to-renderer `preview.update` carries protocol version 2 and a monotonically increasing generation. Stale render results must not replace newer content.
- Treat Markdown, raw HTML, URLs, local paths, and generated SVG as untrusted. Sanitize ordinary HTML and diagram SVG separately.
- Keep absolute filesystem paths in the native layer. Renderer resource URLs and exact-file tokens must be constrained, opaque, cryptographically random, generation-bound, and revocable.
- WebView2 navigation and unexpected network requests are blocked; only explicitly permitted external links leave through the system browser, and the optional HTTPS-image mode is passed through the native policy.
- All diagram render operations are serialized across generations, and Mermaid/PlantUML output is sanitized before display.
- Do not perform parsing or rendering in Notepad++ notification callbacks.
- Keep a newly installed preview hidden. Honor Notepad++ dock-state restoration, refresh immediately whenever the panel becomes visible, and let `NPPM_DMMSHOW`/`NPPM_DMMHIDE` own docked-window visibility so the closed state persists.
- Do not add the GPL PlantUML site/demo build, unpinned runtime dependencies, or a network-backed OpenAPI/PDF service.

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
- Release x64 and Win32 packages separately with CPack. The Plugin Admin ZIP must keep `NotepadViewerPlus.dll` at the archive root and must not include the WebView2 Evergreen Runtime.
- Project-local install rule: after every successful versioned build/package, create `Install-NotepadViewerPlus-<version>.ps1` in the project root (`C:\Users\duc.le_unifiedpost\tools\markdown-preview-plus\`) alongside the release work. It must be a clickable installer delegating to `packaging/install-plugin.ps1`, stop safely when Notepad++ is running, validate the DLL/assets payload, preserve the previous plugin directory as a rollback backup, and support `-TargetDir`/`-NotepadRoot` overrides. Keep `packaging/install-plugin.ps1` as the maintained installer template.

## Maintenance conventions

- Pin dependency versions in `renderer/package-lock.json`.
- The current Phase 2 implementation is protocol-v2 plus the viewer registry, Markdown/diagram/HTML/SVG/structured-data/CSV/OpenAPI/image/PDF adapters, and native exact-file delivery. PDF built-in viewer compatibility and the Swagger UI CSP/network smoke matrix remain release-validation items.
- Prefer small, testable modules over code in the UI entry point.
- Add a regression fixture/test for each security or generation-cancellation fix.
- Keep the plan's phase status and documented limitations current when implementation decisions change.
