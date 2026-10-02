# Notepad Viewer Plus

## Product Phase 3 — Plugin Admin publishing and native UX plan

**Status:** Technical implementation complete; manual validation and publication handoff pending  
**Prepared:** 2026-09-29  
**Target release:** `0.3.0` (proposed)  
**Scope:** Notepad++ Plugin Admin readiness, About dialog, toolbar toggle icon, release validation, and publication handoff  
**Hard constraint:** Do not run `git push` from this company machine. Public release upload, fork updates, and pull-request submission must happen on an approved machine or through an approved workflow.

**Implementation checkpoint (2026-09-29):** The 0.3.0 version source, About command, toolbar resources/registration, command-table regression test, renderer version synchronizer, x64/x86 package validator, report-backed Plugin Admin generator, installer, and release documentation are implemented. Clean x64 and x86 builds/tests/packages and strict size/structural validation pass. The source/binary license and publication rights, final public repository/support URLs, supported-version smoke matrix, Notepad++ manual UX/install matrix, hosted-byte validation, release upload, and upstream Plugin List PR remain pending and must be completed on an approved workflow where applicable.

## TL;DR

- The plugin already implements the required Notepad++ exports, command registration model, current SDK headers, root-DLL ZIP layout, and DLL version metadata.
- Phase 3 should replace **Open Settings** with **About Notepad Viewer Plus**, add a dark-mode-aware toolbar button for **Toggle Preview**, and make release/version metadata reproducible.
- Publication is not yet possible: there is no public release URL or Git remote, the Win32 package and local Plugin Admin installation test are outstanding, and the source/publication license and ownership metadata need confirmation.
- Toolbar branding is approved: reuse the logo from <https://github.com/Duclevn/markdown-preview-plus>, using `src-tauri/icons/icon-source.svg` as the source of truth and its generated icon assets as references. The supplied `1190×77` PNG remains only a toolbar-placement reference.

## 1. Requirements and decisions

### 1.1 User-facing changes

1. Remove the **Open Settings** plugin menu item.
2. Add **About Notepad Viewer Plus** in the same final command position.
3. Open a native modal About popup containing:
   - Product name and release version.
   - A concise feature summary.
   - Author: **Duc Le**.
   - A clickable author link: <https://ducle.uk> (correcting the supplied malformed `https:/ducle.uk`).
4. Add a Notepad++ toolbar button bound to the existing **Toggle Preview** command, so menu, shortcut, and toolbar all use the same panel visibility path.
5. Reuse the approved Markdown Preview Plus logo from <https://github.com/Duclevn/markdown-preview-plus>. Generate standard/light, dark-mode, and legacy bitmap toolbar resources from its `src-tauri/icons/icon-source.svg`, preserving the recognizable dark “M” and coral connected-node mark while making only small-size/theme adaptations needed for legibility.

### 1.2 Proposed About text

> Notepad Viewer Plus provides an offline, docked preview for Markdown, Mermaid, PlantUML, HTML, SVG, JSON, YAML, XML, CSV/TSV, OpenAPI, images, and PDF files. It includes live refresh, table of contents, syntax highlighting, diagrams, themes, and security-focused handling of untrusted content.
>
> Created by Duc Le — ducle.uk

Keep this text concise enough for a normal native dialog. The dialog must not initialize WebView2 or depend on the preview panel being open.

### 1.3 Versioning decision

Use `0.3.0` for the first public Plugin Admin candidate because this phase adds visible native UX and a public distribution contract. If the owner prefers to publish the existing `0.2.x` line, decide that before implementation; all CMake, renderer, DLL resource, ZIP, installer, and Plugin Admin versions must match.

## 2. Current compliance assessment

Assessment date: 2026-09-29.

| Requirement | Current state | Phase 3 action |
|---|---|---|
| Standard Notepad++ plugin exports | `setInfo`, `getName`, `getFuncsArray`, `beNotified`, `messageProc`, and `isUnicode` are exported in `native/plugin/PluginMain.cpp`. | Retain and add an export/load smoke check. |
| Plugin name and commands | Name, command count, labels, callbacks, and shortcut are defined through `PluginConstants.h` and `PluginEntry.cpp`. | Replace only the last `OpenSettings` command with `About`; preserve the toggle command index used by docking. |
| Current official headers | `third_party/npp-plugin-template` is at release `v2026_September_27.40.1`, synchronized with current Notepad++ headers as of this assessment. | Re-check the official headers immediately before the release build; do not fetch or update blindly during implementation. |
| DLL/package identity | `NotepadViewerPlus.dll` matches folder name `NotepadViewerPlus`; the DLL is at ZIP root. | Retain and validate automatically. |
| DLL version | `0.2.2.0` currently matches a Plugin Admin version of `0.2.2` after zero-padding. | Generate or verify every version field from one release version. |
| Architecture | Existing artifact is x64; CMake supports x64 and Win32. ARM64 is explicitly unsupported. | Build and test separate x64 and x86 ZIPs; defer ARM64 and do not add an ARM64 manifest entry. |
| Toolbar integration | Not implemented; the approved source logo exists in `Duclevn/markdown-preview-plus/src-tauri/icons/icon-source.svg`. | Import that approved source, generate plugin-owned resources, and register the Toggle Preview icon on `NPPN_TBMODIFICATION` using `NPPM_ADDTOOLBARICON_FORDARKMODE`. |
| About command | Not implemented; **Open Settings** currently opens the Notepad++ plugin manual, not plugin settings. | Replace with a native About popup and author hyperlink. |
| Plugin Admin package generator | `packaging/plugin-admin/generate-entry.mjs` creates metadata and hashes a local ZIP. | Add stronger release validation and generate one entry per architecture. |
| Public download URL | Missing; this repository has no configured Git remote. | Create a public, stable HTTPS release on an approved machine. |
| Name uniqueness | No `NotepadViewerPlus` / `Notepad Viewer Plus` match was found in the current official x64 or x86 lists. | Re-check immediately before PR submission; current absence is not a reservation. |
| Local Plugin Admin test | Not recorded. | Test install, update, removal, and restart through the official debug Plugin Admin flow. |
| Public license/ownership | No project-root source license is present; DLL `CompanyName` is currently `Unifiedpost`, while requested author is Duc Le. | Confirm publication rights, select a source/binary license, and approve final company/author/copyright metadata before public upload. |
| Baseline checks | Native build/test passes; renderer TypeScript and 35 tests pass; strict size check passes with a 3.29 MiB x64 ZIP. | Repeat from clean x64 and Win32 release builds and run manual smoke matrices. |

The working tree already contains unrelated in-progress Phase 2 changes. Implementation must preserve them and must not use destructive reset/clean operations.

## 3. Implementation plan

### P3.0 — Release identity and publication prerequisites

1. Confirm the public release owner and publication rights.
2. Confirm:
   - Public repository/release URL.
   - Source and binary distribution terms. Add a project-root `LICENSE`/`NOTICE` when publishing source; the current Plugin List schema has no license field, so do not misrepresent this governance requirement as a documented Plugin Admin schema requirement.
   - `CompanyName`, copyright, and author metadata. Publication is blocked until the current `Unifiedpost` value is explicitly approved or replaced and verified in the built DLL.
   - Target release version (`0.3.0` proposed).
   - Whether both x64 and x86 will be published in the first submission.
3. Import the approved toolbar logo source from `Duclevn/markdown-preview-plus/src-tauri/icons/icon-source.svg` and record its repository URL and source commit in the release documentation. Do not crop the supplied toolbar screenshot. Keep the SVG as the vector master and generate the Notepad++ resources reproducibly; pixel-tune only as needed at small sizes without changing the mark's identity.
4. Record the oldest supported Notepad++ version. The initial compatibility candidate is Notepad++ 8.0+ because the dark-mode toolbar API was introduced in 8.0, but the final range must reflect the versions actually smoke-tested.

**Exit criterion:** release identity, license, ownership, logo, architectures, and minimum Notepad++ version are explicit and approved.

### P3.1 — Replace Open Settings with About

Files expected to change:

- `native/plugin/PluginConstants.h`
- `native/plugin/PluginEntry.h`
- `native/plugin/PluginEntry.cpp`
- `native/resources/NotepadViewerPlus.rc`
- `CMakeLists.txt` if an additional native UI library or generated version header is used

Steps:

1. Rename enum member `OpenSettings` to `About` without changing earlier command indexes.
2. Replace `SettingsCommand` with `AboutCommand`.
3. Use a native Win32 popup. Preferred implementation is `TaskDialogIndirect` with hyperlink support; use a resource dialog only if Task Dialog behavior is unreliable in the supported Notepad++ matrix.
4. Open only `https://ducle.uk` through the existing safe `ShellExecuteW` pattern after validating the exact hyperlink target.
5. Read the displayed version from the same build-time version source used for DLL resources and packaging.
6. Keep the popup usable when the preview panel or WebView2 initialization has failed.
7. Extract command-table population into a small testable native helper and add `tests/native/PluginCommandTests.cpp`. The mandatory test must assert command count, every command's order/label, the final About callback, the unchanged Toggle Preview index, and the absence of **Open Settings**. Cover actual popup/link behavior with a manual smoke test.

**Exit criterion:** the automated command-table regression test passes; the plugin menu contains **About Notepad Viewer Plus**, no **Open Settings**, and the popup shows accurate features, version, author, and clickable HTTPS homepage.

### P3.2 — Add the preview toolbar button

Files expected to change/add:

- `native/plugin/PluginEntry.h`
- `native/plugin/PluginEntry.cpp`
- `native/resources/NotepadViewerPlus.rc`
- A resource-ID header under `native/resources/`
- Approved `icon-source.svg` imported from `Duclevn/markdown-preview-plus`, plus generated `.ico` / `.bmp` resources under `native/resources/`

Steps:

1. Starting from the approved SVG (white rounded tile, dark “M”, coral connected-node mark), produce:
   - A light-toolbar icon that preserves the same logo and remains distinct against a light Notepad++ toolbar.
   - A dark-toolbar icon that preserves the same logo and remains distinct against a dark Notepad++ toolbar.
   - A legacy bitmap required by the Notepad++ API.
   - Include 16×16, 24×24, 32×32, and 48×48 images in each multi-resolution icon; validate high-DPI rendering rather than relying on an upscaled single-size icon.
2. Handle `NPPN_TBMODIFICATION` in `PluginEntry::OnNotification`.
3. Load all three native handles and call `NPPM_ADDTOOLBARICON_FORDARKMODE` with the command ID from `functions_[CommandId::TogglePreview]._cmdID`.
4. Use compiled module resources. Load both icons with `LoadIconW` (shared resource handles: retain and do not call `DestroyIcon`) and load the legacy bitmap with `LoadBitmapW` (plugin-owned: store on `PluginEntry` and call `DeleteObject` once during final shutdown). Store the complete `toolbarIconsWithDarkMode` structure on `PluginEntry` for the full interval in which Notepad++ may use it; never pass stack-local or already-destroyed handles. Make registration idempotent.
5. Do not create a separate toolbar-only toggle implementation. The button must invoke the existing `TogglePreview` callback so docking visibility, menu check state, restored state, and refresh behavior stay consistent.
6. If support below Notepad++ 8.0 is approved, add and test the deprecated toolbar API only as an explicit fallback; otherwise declare 8.0+ compatibility.

**Exit criterion:** the toolbar button appears in standard, Fluent light, Fluent dark, small, large, and tested high-DPI modes, and repeatedly toggles the same docked panel without desynchronizing the menu check.

### P3.3 — Make release metadata reproducible

1. Add root `version.json` with the exact shape `{ "version": "0.3.0" }` and make it the canonical release version. Manual duplicated release literals are not acceptable for a Plugin Admin candidate.
2. In CMake, use `file(READ ...)` plus `string(JSON ...)` before `project(...)` to read `version.json`; remove the independently editable `NVP_VERSION` cache default. Convert the native resource to `NotepadViewerPlus.rc.in` and generate both the `.rc` numeric/string values and `Version.h` (used by About) with `configure_file`.
3. Add `packaging/sync-version.mjs` with `--write` and `--check` modes to update/verify renderer `package.json` and `package-lock.json` from `version.json`. CPack, ZIP and installer filenames, and Plugin Admin generation must consume the same value.
4. Add a dedicated package-validation command (separate from `packaging/check-size.mjs`, which currently validates renderer/ZIP size only) and make it fail when:
   - The expected architecture ZIP is missing.
   - `NotepadViewerPlus.dll` is not at ZIP root.
   - DLL basename differs from `folder-name`.
   - DLL version does not equal the declared release version after four-part normalization.
   - Required `assets/` or license inventory is missing.
   - SHA-256 does not match generated metadata.
   - The archive contains build-only or credential material.
5. Implement the validator as `packaging/plugin-admin/validate-package.ps1`. It must inspect ZIP entries, extract to an isolated temporary directory, read DLL version and PE architecture, compare them with `version.json` and the expected architecture, check required assets/notices, clean up reliably, and emit a JSON report containing ZIP path, observed version, observed architecture, and SHA-256. `packaging/check-size.mjs` remains only the size-budget gate.
6. Change `generate-entry.mjs` to require that validator report for final metadata generation. It must recompute the ZIP hash, reject a stale/mismatched report, and derive `version`, architecture, and `id` from validated observations rather than free-form `--version` / `--arch` values. This report-and-recheck contract is the integration seam between validation and manifest generation.
7. Keep the required root-DLL ZIP layout. Do not add a top-level package directory and do not bundle the WebView2 Evergreen Runtime.
8. Add/update the project-root clickable installer for the chosen release version, following the existing installer rule.
9. Keep manifest generation architecture-generic, but reject ARM64 until the native build and validator support it.

**Exit criterion:** one clean command sequence can produce independently valid x64 and x86 packages with synchronized versions and deterministic manifest inputs; the dedicated package validator and strict size gate both pass.

### P3.4 — Documentation and release-page content

Update:

- `README.md`
- `AGENTS.md` when the implemented workflow changes
- `PHASE-2-MULTI-FORMAT-PLAN.md` status/remaining validation
- `packaging/plugin-admin/README.md`
- `docs/syntax-support.md` and `docs/security-model.md` only where behavior changes
- A release checklist or release notes for the selected version

Document:

- Supported formats and offline-by-default behavior.
- Toolbar and About behavior.
- Supported Notepad++ versions and architectures.
- WebView2 Evergreen Runtime prerequisite.
- Exact installation folder and package layout.
- Current PDF/OpenAPI/manual-validation limitations.
- Author/homepage and support/issue URL.
- No-push-on-this-machine publication handoff.

**Exit criterion:** Plugin Admin description, release page, About popup, README, binary metadata, and package names do not contradict one another.

### P3.5 — Validation gate

Automated checks:

1. `cd renderer && npm ci`
2. `npm run lint`
3. `npm test`
4. `npm run build`
5. `npm run size:strict -- <release-zip>` (size budgets only; this is not structural package validation).
6. Generate third-party licenses and confirm no unexpected dependency changes.
7. Configure/build/test/package x64 from a clean build directory.
8. Configure/build/test/package Win32 from a separate clean build directory.
9. Run the dedicated package validator for each artifact to inspect exports, PE architecture, DLL version, ZIP root layout, required files, and unwanted files. A validator failure blocks publication regardless of the earlier size-gate result.
10. Feed only the validator's fresh JSON report to `generate-entry.mjs`; regenerate the report after any ZIP change.
11. Generate and independently re-check SHA-256 for each artifact.
12. Verify the built DLL's company/author/copyright fields against the approved publication metadata; any unresolved `Unifiedpost`/Duc Le ownership conflict blocks release.

Manual Notepad++ checks for both architectures:

1. Clean install into the same-name plugin folder.
2. Upgrade from the prior release while preserving settings.
3. Start hidden; restore a panel left open; close/reopen panel.
4. Toggle through menu, `Ctrl+Alt+P`, toolbar, and dock close button; verify all states remain synchronized.
5. Test toolbar icon in standard, Fluent light, Fluent dark, small/large toolbar, and at least 100% and 200% DPI.
6. Open About, verify version/text, and verify only the HTTPS author link opens externally.
7. Exercise representative Markdown, diagram, structured-data, image, OpenAPI, and PDF fixtures.
8. Confirm default operation produces no unexpected network requests.
9. Test uninstall/removal and Notepad++ restart.
10. Test Plugin Admin install/update/remove using the official debug Notepad++ and debug GUP procedure with a locally edited `nppPluginList.json`.

**Exit criterion:** all automated checks pass, all release-critical manual checks are recorded, and no Critical/High security or packaging issue remains.

## 4. Plugin Admin publication handoff

These steps must occur on an approved machine or through an approved publication workflow; do not execute them from this machine.

1. Create the public project/release location and publish the selected license, support URL, and release notes.
2. Upload immutable architecture-specific assets, for example:
   - `NotepadViewerPlus-0.3.0-x64.zip`
   - `NotepadViewerPlus-0.3.0-x86.zip`
3. Verify each direct HTTPS URL returns the ZIP itself with HTTP 200 and does not require authentication, cookies, or an expiring signed URL.
4. Re-download the public artifacts and calculate SHA-256 from those downloaded bytes. Do not assume the pre-upload and hosted bytes are identical.
5. Generate final Plugin Admin entries with:
   - `folder-name`: `NotepadViewerPlus`
   - `display-name`: `Notepad Viewer Plus`
   - Exact version matching DLL version
   - SHA-256 of the exact hosted ZIP per architecture
   - Direct public ZIP URL
   - Concise feature description
   - `author`: `Duc Le`
   - `homepage`: the approved project page or `https://ducle.uk`
   - Tested `npp-compatible-versions` range
6. Locally test each final hosted entry with the official debug Plugin Admin flow before submission.
7. On an approved machine, fork `notepad-plus-plus/nppPluginList`, create a branch, and modify only:
   - `src/pl.x64.json` for x64
   - `src/pl.x86.json` for Win32/x86
   - Do not edit `pl.arm64.json` without an ARM64 build.
8. Run the upstream validator/CI checks and open the pull request with test evidence and direct release links.
9. Respond to maintainer review. If any ZIP is rebuilt, treat it as a new immutable artifact: upload it, recompute SHA-256, retest, and update the JSON.
10. After merge and Plugin List distribution, verify install, update, and removal in a normal current Notepad++ release.

Plugin Admin requires the SHA-256 `id`; Authenticode signing is recommended for Windows trust but is not a substitute for the Plugin Admin hash and is not listed as a mandatory Plugin List field.

## 5. Acceptance criteria

Phase 3 is complete when:

1. **Open Settings** is absent and **About Notepad Viewer Plus** works independently of WebView2.
2. About shows the agreed product summary, exact release version, **Duc Le**, and a clickable `https://ducle.uk` link.
3. A theme-aware toolbar icon toggles the existing preview panel in all tested toolbar modes without state drift.
4. Current official Notepad++ headers were checked and the supported Notepad++ range is documented from actual tests.
5. x64 and x86 ZIPs contain `NotepadViewerPlus.dll` at root, have matching version metadata, include required assets/licenses, and pass the strict size check.
6. Final hosted ZIPs pass the official local Plugin Admin install/update/remove test.
7. SHA-256 values in each architecture manifest match the exact publicly downloadable bytes.
8. Publication rights, distribution terms/license, author/company metadata, homepage, support location, and public release URL are settled; the built DLL contains the approved ownership metadata.
9. Automated command-table regression coverage proves that **Open Settings** is absent and the About command remains in the intended position.
10. The upstream `nppPluginList` PR is submitted from an approved machine; no `git push` is performed on this company machine.

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Toolbar icon disappears in dark/Fluent mode | Supply all three required handles and smoke-test every toolbar mode. |
| Logo becomes inconsistent with the companion app | Use the approved companion-app SVG as the source of truth, record its source commit, and limit changes to small-size/theme legibility. |
| Menu/toolbar/panel states diverge | Route all activations through `TogglePreview` and retain the existing visibility callback/menu check. |
| Plugin Admin rejects version/hash/package | Generate versions from one source, validate ZIP root and DLL metadata, and hash the exact hosted bytes. |
| A rebuilt release silently invalidates the manifest | Use immutable assets; every changed byte requires a new hash and complete retest. |
| Public author metadata conflicts with company ownership | Obtain publication approval and resolve `CompanyName`/copyright/license before upload. |
| Existing work is lost | Preserve the dirty working tree; no destructive Git commands and no push from this machine. |
| x86 behaves differently from x64 | Use separate build directories and run the same package and smoke matrix for both. |
| Minimum Notepad++ version is guessed | Declare only the range actually tested; use compatibility metadata in both list entries. |

## 7. Authoritative references

- Notepad++ Plugins manual — development, Plugin Admin testing, list rules, and PR flow: <https://npp-user-manual.org/docs/plugins/>
- Official C++ plugin template: <https://github.com/npp-plugins/plugintemplate>
- Official Plugin List repository: <https://github.com/notepad-plus-plus/nppPluginList>
- Plugin List schema: <https://github.com/notepad-plus-plus/nppPluginList/blob/master/pl.schema>
- Plugin List validator: <https://github.com/notepad-plus-plus/nppPluginList/blob/master/validator.py>
- Current plugin API header: <https://github.com/notepad-plus-plus/notepad-plus-plus/blob/master/PowerEditor/src/MISC/PluginsManager/Notepad_plus_msgs.h>
- Approved companion-app logo source: <https://github.com/Duclevn/markdown-preview-plus/blob/main/src-tauri/icons/icon-source.svg>
