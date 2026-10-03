# Notepad++ distribution

## Release identity

`version.json` is the canonical release version. CMake reads it before `project()`, generates the DLL resource and native About version, and uses it for CPack filenames. Keep renderer metadata synchronized with:

```text
node packaging/sync-version.mjs --write
node packaging/sync-version.mjs --check
```

Notepad Viewer Plus 0.4.0 targets separate x64 and x86 packages. ARM64 is not supported. The dark-mode toolbar API requires Notepad++ 8.0 or newer; the final Plugin List compatibility range must not be published until that range has been smoke-tested. The WebView2 Evergreen Runtime is a prerequisite and is not bundled.

## Build and package

Build the renderer and generate the license inventory first:

```text
cd renderer
npm ci
npm run lint
npm test
npm run build
npm run licenses
cd ..
```

For the synced OneDrive checkout, run `Build-Development.ps1 -Package` from the repository root instead; it keeps native caches and packages machine-local. See [OneDrive development](../../docs/onedrive-development.md).

The following in-checkout native build commands are for a **non-synced checkout only**. Use separate clean native build directories:

```text
cmake -S . -B build-release-x64 -G "Visual Studio 17 2022" -A x64 -DNPP_SDK_DIR="third_party/npp-plugin-template" -DWEBVIEW2_SDK_DIR="third_party/Microsoft.Web.WebView2"
cmake --build build-release-x64 --config Release
ctest --test-dir build-release-x64 -C Release --output-on-failure
cpack --config build-release-x64/CPackConfig.cmake -C Release

cmake -S . -B build-release-x86 -G "Visual Studio 17 2022" -A Win32 -DNPP_SDK_DIR="third_party/npp-plugin-template" -DWEBVIEW2_SDK_DIR="third_party/Microsoft.Web.WebView2"
cmake --build build-release-x86 --config Release
ctest --test-dir build-release-x86 -C Release --output-on-failure
cpack --config build-release-x86/CPackConfig.cmake -C Release
```

Each ZIP keeps the Plugin Admin root-DLL layout:

```text
NotepadViewerPlus-0.4.0-x64.zip
├── NotepadViewerPlus.dll
├── THIRD-PARTY-LICENSES.txt
└── assets/
    ├── index.html
    └── ...
```

Do not add a top-level package directory or bundle the WebView2 runtime.

## Validate release artifacts

The strict size check is separate from structural package validation:

```text
cd renderer
npm run size:strict -- ../NotepadViewerPlus-0.4.0-x64.zip
npm run size:strict -- ../NotepadViewerPlus-0.4.0-x86.zip
cd ..

powershell -NoProfile -ExecutionPolicy Bypass -File packaging/plugin-admin/validate-package.ps1 -ZipPath NotepadViewerPlus-0.4.0-x64.zip -Architecture x64 -ReportPath release/x64-validation.json
powershell -NoProfile -ExecutionPolicy Bypass -File packaging/plugin-admin/validate-package.ps1 -ZipPath NotepadViewerPlus-0.4.0-x86.zip -Architecture x86 -ReportPath release/x86-validation.json
```

Custom `-ReportPath` values are overwrite targets: never use the ZIP path or another valuable existing file. The default `<ZIP>.validation.json` report path is the safe option used by `Build-Development.ps1`. This pre-existing custom-output safety limitation is documented in [OneDrive development](../../docs/onedrive-development.md).

The validator checks the ZIP layout, required renderer and notice files, unwanted material, DLL basename, four-part DLL version, ownership metadata, PE architecture, required Notepad++ exports, and SHA-256. It extracts only to an isolated temporary directory and removes it in `finally`.

Generate Plugin List metadata only from a fresh validator report. The generator re-hashes and re-sizes the ZIP and rejects stale reports:

```text
node packaging/plugin-admin/generate-entry.mjs ^
  --report=release/x64-validation.json ^
  --repository=https://github.com/<owner>/<repo>/releases/download/v0.4.0/NotepadViewerPlus-0.4.0-x64.zip ^
  --homepage=https://ducle.uk ^
  --npp-compatible-versions=<tested-range>
```

Repeat for x86. Rebuilds invalidate the report and manifest hash.

## Manual installation

Extract the matching package into:

```text
<Notepad++>\plugins\NotepadViewerPlus\
```

The DLL must be at `<Notepad++>\plugins\NotepadViewerPlus\NotepadViewerPlus.dll`. Restart Notepad++ after extraction. The x86 ZIP is only for 32-bit Notepad++; the x64 ZIP is only for 64-bit Notepad++.

For the local x64 candidate, close Notepad++ and double-click `Install-NotepadViewerPlus-0.4.0.cmd`. This launcher starts the matching PowerShell wrapper with a process-only execution-policy override and keeps the result visible. The installer validates the essential payload, requests elevation when needed, and preserves the previous plugin directory as a rollback backup. Use `-ZipPath`, `-NotepadRoot`, or `-TargetDir` for another package or installation.

## Toolbar artwork provenance

The vector master is `native/resources/icon-source.svg`, imported from `Duclevn/markdown-preview-plus/src-tauri/icons/icon-source.svg` at commit `230b9d55acf7723606e53b4e9da3e46a3cee67be`. The toolbar adaptation uses a full-bleed coral tile, enlarged white “M”, and simplified dark node mark so the control remains easy to locate at 16–24 px on both light and dark toolbars. Regenerate the light, dark, and legacy resources with:

```text
python packaging/generate-toolbar-icons.py
```

Python 3 and Pillow are required only for regeneration. The generated ICO resources contain 16, 24, 32, and 48 pixel images.

## Official Plugin Admin handoff

A local ZIP is not a Plugin Admin publication. Before submission:

1. Resolve source/binary publication rights and add the approved project license.
2. Publish immutable x64/x86 ZIPs at direct, unauthenticated HTTPS URLs.
3. Re-download and validate the hosted bytes, then regenerate reports and entries.
4. Run the official debug Notepad++/GUP install, update, remove, and restart flow.
5. On an approved machine, update only `src/pl.x64.json` and `src/pl.x86.json` in a fork of `notepad-plus-plus/nppPluginList` and open the PR.

Do not run `git push`, publish a release, update a fork, or submit the Plugin List PR from this company machine.
