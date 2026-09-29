# Notepad Viewer Plus

Offline, view-only multi-format preview for Notepad++ with a native WebView2 shell and a TypeScript viewer registry.

## Implemented Phase 2 foundation

- Dockable native Win32/WebView2 panel lifecycle with protocol-v2, generation-aware updates.
- Public identity `NotepadViewerPlus` / “Notepad Viewer Plus”, fresh WebView2 data directory, renamed panel class, and migration from `MarkdownPreviewPlus.ini` to `NotepadViewerPlus.ini`.
- Explicit text versus opaque exact-file source modes. PDF and image bytes never pass through the JSON bridge or `SCI_GETTEXT`.
- Cryptographically random, generation-bound exact-file tokens with revocation, MIME allowlisting, response headers, and bounded HTTP ranges.
- Viewer shell and registry with Markdown, standalone Mermaid/PlantUML, HTML sandbox, sanitized SVG, JSON/YAML/XML trees, CSV/TSV virtualization, image controls, safe plain-text fallback, and a view-only PDF resource viewer.
- Offline-by-default navigation/resource policy, strict CSP, standalone/generated SVG sanitization, same-document OpenAPI `$ref` validation, and bounded parser/rendering limits.
- Pinned dependencies, license inventory, size report, fixtures, and unit/security tests.

See [`PHASE-2-MULTI-FORMAT-PLAN.md`](PHASE-2-MULTI-FORMAT-PLAN.md), [`docs/syntax-support.md`](docs/syntax-support.md), [`docs/security-model.md`](docs/security-model.md), and [`docs/architecture-decisions/ADR-0002-phase2-isolation.md`](docs/architecture-decisions/ADR-0002-phase2-isolation.md).

The preview starts hidden unless Notepad++ restores a panel left open. Use **Ctrl+Alt+P** or **Plugins → Notepad Viewer Plus → Toggle Preview** to show or hide it.

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
ctest --test-dir build -C Release --output-on-failure
cpack --config build/CPackConfig.cmake -C Release
```

This produces an architecture-specific ZIP with `NotepadViewerPlus.dll` at the archive root, which is the layout required by Notepad++ Plugin Admin. See [`packaging/plugin-admin/README.md`](packaging/plugin-admin/README.md) for manual installation and Plugin Admin metadata.

For a local install, close Notepad++, then right-click `Install-NotepadViewerPlus-0.2.2.ps1` in the project root and choose **Run with PowerShell**. The installer finds the latest generated ZIP, requests administrator permission when needed, validates the payload, and keeps the previous plugin directory as a rollback backup. For a portable/custom installation, run it with `-NotepadRoot "C:\path\to\Notepad++"` or `-TargetDir "C:\path\to\plugins\NotepadViewerPlus"`.

Build Win32 separately for 32-bit Notepad++. The current Windows development environment can build and test the x64 native plugin with the SDKs under `third_party/`.

## Current validation limits

The built-in WebView2 PDF path and Notepad++ installation/upgrade matrix still require manual smoke testing on supported WebView2/Notepad++ versions. Swagger/OpenAPI uses a locally bundled lazy UI chunk in documentation-only mode and rejects remote or cross-file `$ref` values; no network-backed Swagger configuration is used.
