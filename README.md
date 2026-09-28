# Markdown Preview Plus

Offline Markdown preview for Notepad++ with a native WebView2 shell and a TypeScript renderer.

## Implemented foundation

- Dockable native Win32/WebView2 panel lifecycle state machine.
- Generation-aware document snapshots and debounced updates.
- Versioned JSON bridge with origin, size, URL, and path checks.
- Markdown-it pipeline with YAML front matter, an optional generated table of contents, safe raw HTML, admonitions, math, code fences, Mermaid Tiny, and PlantUML.
- Sandboxed math/diagram frames, strict main-page CSP, SVG sanitization, Blob-backed display, and constrained local resources.
- Lazy renderer chunks, pinned dependencies, license inventory, size report, fixtures, and unit/security tests.

See [`PLAN-AND-ARCHITECTURE.md`](PLAN-AND-ARCHITECTURE.md), [`docs/syntax-support.md`](docs/syntax-support.md), and [`docs/security-model.md`](docs/security-model.md).

The preview starts hidden unless Notepad++ restores a panel that was left open. Use **Ctrl+Alt+P** or **Plugins → Markdown Preview Plus → Toggle Preview** to show or hide it. The same plugin menu contains **Toggle Table of Contents**.

The proposed multi-format expansion and product rename to **Notepad Viewer Plus** are documented in [`PHASE-2-MULTI-FORMAT-PLAN.md`](PHASE-2-MULTI-FORMAT-PLAN.md). The rename has not yet been applied to binaries or package identities.

## Renderer development

```text
cd renderer
npm ci
npm run lint
npm test
npm run build
npm run size:strict
npm run licenses
```

To run the browser smoke page, build and serve `renderer/dist` with a local static server, then open `/?demo=1`. The development-only demo is not used by the Notepad++ host.

## Native build

Install the official Notepad++ plugin SDK, WebView2 Win32 SDK, and Visual Studio Build Tools, then configure:

```text
cmake -S . -B build -G "Visual Studio 17 2022" -A x64 \
  -DNPP_SDK_DIR="C:/path/to/plugintemplate" \
  -DWEBVIEW2_SDK_DIR="C:/path/to/Microsoft.Web.WebView2"
cmake --build build --config Release
cpack --config build/CPackConfig.cmake -C Release
```

This produces an architecture-specific ZIP with `MarkdownPreviewPlus.dll` at the archive root, which is the layout required by Notepad++ Plugin Admin. See [`packaging/plugin-admin/README.md`](packaging/plugin-admin/README.md) for manual installation and official Plugin Admin submission.

Build Win32 separately for 32-bit Notepad++. The current Windows development environment can build and test the x64 native plugin with the SDKs under `third_party/`.
