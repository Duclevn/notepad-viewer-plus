# Notepad Viewer Plus

Offline, view-only multi-format preview for Notepad++ with a native WebView2 shell and a TypeScript viewer registry.

## Implemented foundation

- Dockable native Win32/WebView2 panel lifecycle with protocol-v2, generation-aware updates.
- Public identity `NotepadViewerPlus` / “Notepad Viewer Plus”, fresh WebView2 data directory, renamed panel class, and migration from `MarkdownPreviewPlus.ini` to `NotepadViewerPlus.ini`.
- Explicit text versus opaque exact-file source modes. PDF and image bytes never pass through the JSON bridge or `SCI_GETTEXT`.
- Cryptographically random, generation-bound exact-file tokens with revocation, MIME allowlisting, response headers, and bounded HTTP ranges.
- Viewer shell and registry with Markdown, standalone Mermaid/PlantUML, HTML sandbox, sanitized SVG, JSON/YAML/XML trees, CSV/TSV virtualization, image controls, safe plain-text fallback, and a view-only PDF resource viewer.
- Format-aware light/dark/system theming: native dark UI where supported, effective-theme rendering for Mermaid/PlantUML/KaTeX/code, compatibility canvases for authored or third-party content, and selectable image/SVG artboards.
- Offline-by-default navigation/resource policy, strict CSP, standalone/generated SVG sanitization, same-document OpenAPI `$ref` validation, and bounded parser/rendering limits.
- Pinned dependencies, license inventory, size report, fixtures, and unit/security tests.
- Phase 3 native UX: a theme-aware **Toggle Preview** toolbar button and an **About Notepad Viewer Plus** dialog with the canonical release version and author homepage.
- Reproducible `version.json` release identity, synchronized renderer metadata, x64/x86 structural package validation, export/PE/version checks, and validator-backed Plugin Admin entry generation.

See [`PHASE-2-MULTI-FORMAT-PLAN.md`](PHASE-2-MULTI-FORMAT-PLAN.md), [`docs/syntax-support.md`](docs/syntax-support.md), [`docs/security-model.md`](docs/security-model.md), and [`docs/architecture-decisions/ADR-0002-phase2-isolation.md`](docs/architecture-decisions/ADR-0002-phase2-isolation.md).

The preview starts hidden unless Notepad++ restores a panel left open. Use **Ctrl+Alt+P**, **Plugins → Notepad Viewer Plus → Toggle Preview**, or the toolbar button to show or hide the same docked panel. **Plugins → Notepad Viewer Plus → About Notepad Viewer Plus** opens a native dialog that does not depend on WebView2.

## Project folder identity

Use `notepad-viewer-plus` for the checkout folder. To finish migrating an existing old-name checkout, close Pi/IDEs and run `Rename-ProjectFolder.ps1` from an external PowerShell window. It preserves Git history, source, dependencies, and release ZIPs, invalidates verified native build caches, and refreshes current-version package reports. See [`docs/project-name-migration.md`](docs/project-name-migration.md) for rebuild commands and intentional legacy references.

## Clone setup

Clone the source repository with its pinned Notepad++ SDK gitlink, then generate the ignored versioned installer wrapper before the first build:

```powershell
git clone --recurse-submodules https://github.com/Duclevn/notepad-viewer-plus.git
cd notepad-viewer-plus
node packaging/sync-version.mjs --write
```

If the repository was cloned without `--recurse-submodules`, run `git submodule update --init --recursive`. The repository includes the WebView2 headers and x64/x86 static loader libraries required for fresh native builds; other generated SDK build files remain ignored.

## OneDrive / another computer

Start with [New computer setup](NEW-COMPUTER-SETUP.md) for the complete download, tooling, build/test, installation, and runtime checklist.

For the transition from Pi to interactive Codex development, read [Codex handover](CODEX-HANDOVER.md). It records the current computer's validated build/install, the missing-square-root rendering defect, and the remaining visual checks.

From any `notepad-viewer-plus` checkout, use `Build-Development.ps1`: it resolves the checkout automatically, validates the renderer, and creates fresh x64/x86 native builds outside OneDrive under `%LOCALAPPDATA%`. On a new Windows computer, install the development tools, finish downloading the folder, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-Development.ps1 -InstallDependencies
```

See [OneDrive development](docs/onedrive-development.md) for prerequisites, local package paths, and safe computer-switching rules. `.gitignore` does not control OneDrive syncing; do not work on the synced checkout concurrently from two computers.

## Renderer development

```text
node packaging/sync-version.mjs --check
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

For this synced checkout, prefer `Build-Development.ps1` as described above. The following in-checkout build commands are for a **non-synced checkout only**. Install the official Notepad++ plugin SDK, WebView2 Win32 SDK, and Visual Studio Build Tools, then configure:

```text
cmake -S . -B build -G "Visual Studio 17 2022" -A x64 \
  -DNPP_SDK_DIR="C:/path/to/plugintemplate" \
  -DWEBVIEW2_SDK_DIR="C:/path/to/Microsoft.Web.WebView2"
cmake --build build --config Release
ctest --test-dir build -C Release --output-on-failure
cpack --config build/CPackConfig.cmake -C Release
```

This produces an architecture-specific ZIP with `NotepadViewerPlus.dll` at the archive root, which is the layout required by Notepad++ Plugin Admin. See [`packaging/plugin-admin/README.md`](packaging/plugin-admin/README.md) for manual installation and Plugin Admin metadata.

For a local x64 install, close Notepad++, then right-click `Install-NotepadViewerPlus-0.3.0.ps1` in the project root and choose **Run with PowerShell**. The installer validates the essential payload, requests administrator permission when needed, and keeps the previous plugin directory as a rollback backup. For a portable/custom installation, run it with `-ZipPath`, `-NotepadRoot "C:\path\to\Notepad++"`, or `-TargetDir "C:\path\to\plugins\NotepadViewerPlus"`.

Build Win32 separately for 32-bit Notepad++. Release candidates support x64 and x86; ARM64 is not supported. Notepad++ 8.0+ is the API compatibility baseline because the plugin uses the dark-mode toolbar API, but the final Plugin Admin compatibility range remains pending the recorded manual smoke matrix. The Microsoft Edge WebView2 Evergreen Runtime and the supported Microsoft Visual C++ v14 Redistributable matching the plugin architecture are required.

## Current validation limits

The built-in WebView2 PDF path, toolbar modes/DPI, and Notepad++ clean-install/upgrade/Plugin Admin matrix still require manual smoke testing on supported WebView2/Notepad++ versions. Swagger/OpenAPI uses a locally bundled lazy UI chunk in documentation-only mode and rejects remote or cross-file `$ref` values; no network-backed Swagger configuration is used. The user explicitly authorized the primary session on 2026-10-02 to push this source snapshot to the private repository `https://github.com/Duclevn/notepad-viewer-plus`; public release upload remains blocked until publication rights, a project source/binary license, and the required manual release validation are approved.
