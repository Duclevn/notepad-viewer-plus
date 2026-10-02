<!-- BEGIN CODEX GLOBAL MULTI-AGENT WORKFLOW -->
# Global Codex Multi-Agent Workflow

This is a personal default for all repositories. Follow applicable project and
directory instructions as well.

## Shared practice

For coding, review, and testing work, load and follow the personal
`karpathy-guidelines` skill when available. Apply these principles even when the
skill is unavailable: state assumptions, surface ambiguity, make the smallest
sufficient change, avoid unrelated cleanup, define acceptance criteria, and
validate before claiming completion.

## Primary session: Sol / Orchestrator

The current primary Codex session is the orchestrator. It owns user
communication, requirement understanding, classification, acceptance criteria,
delegation, review routing, final validation, and final reporting. Do not create
a separate permanent orchestrator agent.

## User override

If the user says “do not delegate,” “do it yourself,” “I want you, not another
agent/model,” “keep this in the current model,” or equivalent, do not spawn a
worker for that task. Execute or answer in the primary session.

## Fast path

For a clear, localized, low-risk implementation request, delegate directly to
the `implementation` agent. Do not over-plan a text edit, localized CSS change,
small configuration change, or similarly bounded task. Before delegating, check
that the task is understood, that no risk signal is present, and that the user
did not request primary-session execution.

## Normal and complex work

For normal work, create a concise checklist, scope, assumptions, acceptance
criteria, and validation commands, then delegate to `implementation`.

For large, cross-module, security-sensitive, data-sensitive, concurrent,
public-API, migration, or otherwise high-risk work, create a fuller plan and
route the result to `reviewer` after implementation. Use `reviewer` only for
large/high-risk changes or when the user explicitly asks for review.

## QC routing

Use `qc` only when the user explicitly asks for testing, QC, verification,
validation, reproduction, regression testing, acceptance testing, or test-case
work. Do not invoke QC merely because an implementation task exists.

## Delegation contract

Send every worker an objective, context, scope, non-goals, assumptions,
checklist, acceptance criteria, validation commands, constraints, escalation
rule, and return format. Require the worker to report changed files and checks
actually executed.

## Trust but verify

The primary session reviews the worker’s actual result and evidence before
claiming completion. A worker summary is not proof by itself. For Tiny tasks,
keep this review lightweight; for large/high-risk work, use `reviewer`.

## Safety and Git

Do not infer authorization to commit or push. If the user explicitly requests
commit or push, verify the diff, branch, remote, message, and validation before
performing the operation. Respect the active approval and sandbox settings.

## Reporting

Final responses must distinguish completed, failed, blocked, and not-run work.
Never claim a test, build, commit, push, review, or skill load that was not
actually performed.
<!-- END CODEX GLOBAL MULTI-AGENT WORKFLOW -->

# Notepad Viewer Plus

## Purpose

Notepad Viewer Plus is a Windows Notepad++ plugin with an offline, docked multi-format preview. The native C++ layer owns Notepad++ integration, WebView2 hosting, protocol-v2 serialization, document/resource coordination, and exact-file security; the TypeScript renderer owns format dispatch, parsing, sanitization, syntax support, and viewer rendering.

## Architecture and ownership

- `native/`: C++17 Win32/Notepad++ shell, document coordination, WebView2 lifecycle, protocol-v2 serializer/validation, resource policy, exact-file tokens, and settings.
- `renderer/`: TypeScript/Vite viewer shell and registry. Keep rendering, table-of-contents generation, structured-data limits, and untrusted-content handling in the WebView2 renderer process. Viewer adapters declare one of the shared theme behaviors (`native`, `theme-aware`, `light-canvas`, `selectable-canvas`, or `isolated`) instead of inventing format-specific global theme rules.
- `tests/`: native regression tests and format/security fixtures used by integration smoke tests; renderer unit/security tests live under `renderer/tests/`.
- `docs/`: user-facing syntax/security documentation and implementation decisions.
- `packaging/`: release manifests, size checks, validator-backed Plugin Admin metadata, toolbar-resource generation, installers, and third-party license inventory.
- `version.json`: canonical release version consumed by CMake, renderer synchronization, DLL resources, CPack, installers, and Plugin Admin validation.
- `CMakeLists.txt`: native build entry point; a Visual Studio C++/CMake environment is required for the native target.
- `Build-Development.ps1`: portable OneDrive development entry point; validates renderer/native builds with fail-fast command handling and keeps native caches/packages machine-local.
- `NEW-COMPUTER-SETUP.md`: step-by-step new-computer run/development guide, prerequisite checks, installation commands, and handover checklist.
- `CODEX-HANDOVER.md`: verified Pi-to-Codex transition snapshot, current-machine build/install evidence, open rendering defects, and safe interactive visual-validation workflow. Revalidate dated/local facts before relying on them.
- `docs/onedrive-development.md`: second-computer prerequisites, migration evidence, and synchronization safety.

## Code map

- `native/plugin/PluginMain.cpp` exports the Notepad++ entry points. `PluginEntry.*` owns command registration, plugin startup/shutdown, dock visibility, toolbar/About commands, and wiring between native services.
- `native/plugin/DocumentCoordinator.*` observes Scintilla/Notepad++ notifications, debounces refreshes, snapshots the active document, chooses format/source mode, and increments generations.
- `native/preview/PreviewPanel.*` owns the Win32 dock window and WebView2 environment/controller, navigation and resource interception, readiness, visibility, and queued update delivery.
- `native/bridge/MessageBroker.*` and `JsonWriter.*` define protocol-v2 serialization/validation and origin-checked renderer messages. `native/preview/ResourcePolicy.*` constrains canonical paths and opaque directory/exact-file tokens, including revocation and media limits. `native/settings/SettingsService.*` loads, migrates, bounds, and saves INI settings.
- `renderer/src/bridge/{bridge,protocol}.ts` is the host boundary and generation gate. `renderer/src/ui/{app.ts,theme.ts,styles.css}` is the renderer shell and theme handling.
- `renderer/src/viewers/registry.ts` dispatches to format adapters under `renderer/src/viewers/`; `renderer/src/markdown/{pipeline,math,math-frame}.ts` handles Markdown, metadata/TOC, and KaTeX frame rendering.
- `renderer/src/diagrams/{diagrams,frame,plantuml-render}.ts` serializes Mermaid/PlantUML work through sandboxed frames. `renderer/src/security/{sanitize,resource-policy}.ts` keeps HTML, generated math, standalone SVG, diagram SVG, and resource/link policies separate. `renderer/src/viewers/artboard.ts` supplies explicit compatibility backgrounds for authored or third-party content.

The native side must retain absolute filesystem paths and perform document/resource coordination. The renderer must keep parsing, rendering, limits, TOC creation, and untrusted-content handling out of Notepad++ callbacks.

## Stack

- Native code is C++17/Win32 against the Notepad++ plugin SDK and WebView2 Win32 SDK, built with CMake and Visual Studio 2022 tooling. The SDKs are provisioned under `third_party/`.
- The renderer is strict TypeScript targeting ES2022, bundled by Vite and tested with Vitest in jsdom. Runtime dependencies are pinned in `renderer/package-lock.json`, including Markdown-it, KaTeX, DOMPurify, highlight.js, Mermaid Tiny, `@plantuml/core`, and the local lazy Swagger UI bundle.

## Repository state and SDK

- The Pi handover included modified and untracked source/docs plus intentional deletions of legacy binaries/packages. Preserve that work and inspect the current `git status --short`; do not assume HEAD or a dated handover describes the entire working tree. Do not reset, clean, restore deleted artifacts, or stage unrelated artifacts during onboarding. The user explicitly authorized the primary session on 2026-10-02 to stage, commit, and push this source snapshot to the private repository `https://github.com/Duclevn/notepad-viewer-plus`; verify the diff, branch, remote, and validation before doing so. Public release uploads remain a separate decision pending publication rights, licensing, and manual release validation.
- `third_party/npp-plugin-template` is a complete nested Git repository recorded by the outer repository as the pinned gitlink revision `27b7077ba89766b3a5a136a3d71af3a0cccc7d2a`. `.gitmodules` records the official upstream `https://github.com/npp-plugins/plugintemplate.git`; fresh clones should use `git clone --recurse-submodules` (or `git submodule update --init --recursive` after cloning) and keep the gitlink pinned.
- The repository carries the WebView2 headers and x64/x86 static loader libraries required by the native build. Their paths are explicitly allowlisted in `.gitignore`; other generated WebView2 build files and local build outputs remain ignored.
- For this OneDrive checkout, keep native build trees, CPack staging, release ZIPs, validation reports, and generated installer wrappers outside new Git additions. The helper places native outputs and packages under `%LOCALAPPDATA%` using a checkout-path hash. Work on one computer at a time and wait for OneDrive synchronization before switching.

## Invariants

- Runtime operation is offline by default: no CDN, local HTTP server, PlantUML server, remote include, Swagger definition URL, or remote `$ref`. An explicit remote-image setting may allow HTTPS image requests only.
- Every host-to-renderer `preview.update` carries protocol version 2 and a monotonically increasing generation. Stale render results must not replace newer content. Treat both `renderer.ready` and successful top-level `NavigationCompleted` as idempotent readiness signals so an early WebView2 message cannot leave the panel loading forever.
- Treat Markdown, raw HTML, URLs, local paths, and generated SVG as untrusted. Sanitize ordinary HTML and diagram SVG separately.
- Keep absolute filesystem paths in the native layer. Renderer resource URLs and exact-file tokens must be constrained, opaque, cryptographically random, generation-bound, and revocable.
- WebView2 navigation and unexpected network requests are blocked; only explicitly permitted external links leave through the system browser, and the optional HTTPS-image mode is passed through the native policy.
- All diagram render operations are serialized across generations, and Mermaid/PlantUML output is sanitized before display.
- PDF is an explicit isolation exception: the built-in WebView2 viewer uses an unsandboxed iframe only for the active exact-file `https://doc.local/file/<token>` resource; native policy remains authoritative and the PDF frame has no renderer message channel. Do not copy this exception to HTML or diagram frames.
- Resolve `system` to an effective light/dark theme before rendering generated content. Use native dark rendering for Mermaid and PlantUML rather than post-processing generated SVG colors. Preserve other authored and third-party colors on explicit compatibility artboards rather than applying unsafe color inversion: Swagger UI and sanitized HTML use light canvases; standalone SVG and raster images expose light/dark/checkerboard backgrounds; PDFs remain isolated and content-preserving.
- Do not perform parsing or rendering in Notepad++ notification callbacks.
- Respect each Notepad++ message's documented return contract: `RUNCOMMAND_USER` string copy calls return `BOOL`, while sized messages such as `NPPM_GETPLUGINSCONFIGDIR` return a character count only for the null-buffer sizing call and `BOOL` for the copy call. Never interpret a successful copy result as the string length.
- Keep a newly installed preview hidden. Honor Notepad++ dock-state restoration, refresh immediately whenever the panel becomes visible, and let `NPPM_DMMSHOW`/`NPPM_DMMHIDE` own docked-window visibility so the closed state persists.
- Do not add the GPL PlantUML site/demo build, unpinned runtime dependencies, or a network-backed OpenAPI/PDF service.

## Development commands

From `renderer/`:

- `npm ci` — install the locked renderer dependencies.
- `npm run build` — build the production renderer and lazy chunks.
- `npm test` — run renderer unit/security tests.
- `npm run test:watch` — run tests interactively.
- `npm run lint` — TypeScript check (`tsc --noEmit`; there is no separate ESLint script).
- `npm run version:check` — verify renderer package metadata matches root `version.json`.

From the repository root, `node packaging/sync-version.mjs --check` verifies `version.json`, renderer metadata, and the generated versioned installer wrapper. After changing `version.json`, run `node packaging/sync-version.mjs --write`; the build helper does not regenerate that wrapper.

For this OneDrive checkout, prefer `powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-Development.ps1` from the repository root; add `-InstallDependencies` on a new computer and `-Package` for machine-local validated ZIPs. The helper uses fresh native caches under `%LOCALAPPDATA%\NotepadViewerPlus\development\<checkout-path-hash>` instead of synchronizing machine-specific build files. See `docs/onedrive-development.md`. Never assume `.gitignore` excludes files from OneDrive or operate on synced Git metadata from two computers concurrently.

Low-level commands for a non-synced checkout (do not reuse these in-checkout native build locations for OneDrive development):

- `cmake -S . -B build -G "Visual Studio 17 2022" -A x64 -DNPP_SDK_DIR="third_party/npp-plugin-template" -DWEBVIEW2_SDK_DIR="third_party/Microsoft.Web.WebView2"`
- `cmake --build build --config Release`
- `ctest --test-dir build -C Release --output-on-failure`
- `cpack --config build/CPackConfig.cmake -C Release`

Native development requires CMake, Visual Studio 2022 Build Tools with the C++ workload and Windows SDK, the Notepad++ plugin template SDK, and the WebView2 SDK. Validate the native tests and renderer checks before packaging.

## Verification tiers

- Renderer checks: from `renderer/`, run `npm.cmd run version:check`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, and `npm.cmd run size:strict`. Run `npm.cmd run licenses` after runtime dependency changes and review `packaging/THIRD-PARTY-LICENSES.txt` plus `docs/third-party-licenses.md`.
- Native checks: use `Build-Development.ps1` from the repository root. It runs the renderer checks, fresh machine-local CMake configure/build, and CTest for each requested `x64` or `x86` architecture. Use `-Architecture x64 -Package` for the usual OneDrive-safe release candidate; omit the architecture only when both are intentionally required.
- Package checks: `-Package` runs CPack and `packaging/plugin-admin/validate-package.ps1`, which is separate from the renderer size gate. Use the validator's default `<ZIP>.validation.json` report path; custom report paths are overwrite targets. Feed only a fresh validator report to `packaging/plugin-admin/generate-entry.mjs`.
- Manual release checks remain required for a matching Notepad++ architecture, WebView2/VC runtime, clean install/upgrade/restart, dock state, toolbar/DPI, live refresh and cancellation, themes, PDF, OpenAPI CSP/network behavior, image/SVG backgrounds, and representative format fixtures. Do not publish from this company machine until publication rights, source/binary licensing, and the supported-version smoke matrix are approved.

## Packaging and validation

- `npm run build` must emit only packaged runtime assets under `renderer/dist`.
- `packaging/check-size.mjs` reports initial/lazy chunk sizes, required assets, optional ZIP size, and release-size thresholds; use `npm run size:strict` in CI. It is not the structural package validator.
- Run `packaging/plugin-admin/validate-package.ps1` for every x64/x86 release ZIP. `packaging/plugin-admin/generate-entry.mjs` accepts only that validator's fresh JSON report and rechecks the ZIP hash and size before emitting Plugin Admin metadata.
- Regenerate `packaging/THIRD-PARTY-LICENSES.txt` with `npm run licenses` and update `docs/third-party-licenses.md` whenever runtime dependencies change. The generator includes all non-development lockfile packages.
- Release x64 and Win32 packages separately with CPack. The Plugin Admin ZIP must keep `NotepadViewerPlus.dll` at the archive root and must not include the WebView2 Evergreen Runtime. ARM64 is unsupported.
- Generate toolbar resources from `native/resources/icon-source.svg` with `python packaging/generate-toolbar-icons.py`; keep the approved source commit documented in `packaging/plugin-admin/README.md`.
- Project-local install rule: after every successful versioned build/package, ensure `Install-NotepadViewerPlus-<version>.ps1` exists in the checkout root (generate it with `node packaging/sync-version.mjs --write`; resolve paths from the checkout, never a hard-coded username). It must be a clickable installer delegating to `packaging/install-plugin.ps1`, stop safely when Notepad++ is running, validate the DLL/assets payload, preserve the previous plugin directory as a rollback backup, and support `-TargetDir`/`-NotepadRoot` overrides. Keep `packaging/install-plugin.ps1` as the maintained installer template.

## Maintenance conventions

- Pin dependency versions in `renderer/package-lock.json`.
- The current Phase 2 implementation is protocol-v2 plus the viewer registry, Markdown/diagram/HTML/SVG/structured-data/CSV/OpenAPI/image/PDF adapters, and native exact-file delivery. PDF built-in viewer compatibility and the Swagger UI CSP/network smoke matrix remain release-validation items.
- Prefer small, testable modules over code in the UI entry point.
- Add a regression fixture/test for each security or generation-cancellation fix.
- Keep the plan's phase status and documented limitations current when implementation decisions change.
- Use `notepad-viewer-plus` for the repository folder and `NotepadViewerPlus` for DLL/package/settings identities. Legacy-name strings are allowed only for upgrade compatibility, clearly labeled history, and external artwork provenance; do not rewrite those references blindly.
- Keep native build directories, CPack staging, local release ZIPs, validation reports, and generated installer wrappers out of new Git additions. Existing tracked legacy artifacts must remain deleted; do not recreate or merely rename their old binaries.
- To migrate an old checkout folder, close Pi/IDEs and run `Rename-ProjectFolder.ps1` from PowerShell outside the checkout. It preserves source, Git history, dependencies, and release ZIPs; discards only verified generated native build caches; and regenerates current-version ZIP validation reports. Reconfigure/rebuild both architectures afterward. See `docs/project-name-migration.md`.

## Current handover and open work

- `CODEX-HANDOVER.md` is a dated transition record, not current validation. Its first confirmed defect is visual: `\sqrt{x^2 + y^2}` loses the radical and overbar in the live preview and PDF while neighboring formulas render.
- The missing-geometry mechanism is unresolved. `sanitizeGeneratedMath` currently uses DOMPurify HTML/MathML profiles without an SVG profile; that is an investigation hypothesis only. Compare original and sanitized KaTeX output, then inspect allowed styles, frame sizing/clipping, and actual WebView2 rendering before changing policy. Do not relax DOMPurify, CSP, iframe isolation, or KaTeX `trust: false`. Follow the reproduction and six acceptance criteria in `CODEX-HANDOVER.md` section 4.
- Other handover limits include live refresh/cancellation, full theme/dock persistence, PDF and OpenAPI network smoke coverage, image/SVG backgrounds, toolbar/DPI and install/upgrade matrices, fresh x86 release validation, and publication/license approval. Keep these as explicit manual/release work rather than inferring them from unit or build results.

## Test and fixture map

- Native regression tests are under `tests/native/` (protocol/JSON, Notepad++ message contracts, commands, resource policy, and origin policy). Packaging/migration checks are under `tests/packaging/`.
- Renderer tests are under `renderer/tests/` (protocol, security, Markdown pipeline/viewers, diagrams/PlantUML, and theme behavior). Format/security input fixtures are under `test-fixtures/`; `tests/syntax-showcase.md` is the integrated visual fixture and `tests/reading-chart.png` is a local asset.
- Add a focused regression fixture whenever changing generation cancellation, resource boundaries, sanitization, or format dispatch. A passing renderer suite does not replace installed Notepad++/WebView2 smoke testing.

## Documentation freshness

This onboarding pass inspected the source, manifests, build helper, README, setup/OneDrive guides, security/syntax docs, and handover on 2026-10-02. The primary session freshly ran renderer version, TypeScript, and unit checks; it did not rerun the native/full build, package/install flow, or live UI/PDF smoke checks during this documentation refresh. Revalidate dated machine paths, package hashes, runtime versions, and visual observations before relying on them.
