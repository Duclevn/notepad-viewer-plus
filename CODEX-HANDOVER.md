# Codex Handover — Notepad Viewer Plus

**Prepared:** 2026-10-02  
**Scope:** Continue development in the interactive Codex agent on this Windows computer. This is a verified handover snapshot, not a declaration that every viewer/runtime combination passes.

**Later validation update, 2026-10-02:** The multi-format testing pass added 60 offline fixtures and expanded the renderer suite to 55 passing tests. Fresh x64/x86 native builds, CTest and package validators passed. It confirmed and corrected missing KaTeX SVG geometry, positioned overbrace clipping, dark-theme print contrast and UTF-8 CSV cell truncation. The corrected x64 payload was checked in isolated Notepad++/WebView2 hosts and the final math PDF was rendered and inspected. The installed user's plugin was not replaced. See [test cases](docs/viewer-test-cases.md) and [results, final package hashes and remaining gaps](docs/viewer-validation-results.md). The original snapshot below remains historical; its defect status and package hashes do not describe the later build.

## TL;DR

- Development setup is working: the current **0.3.0 x64** source built successfully, all **36 renderer tests** and the **x64 native CTest suite** passed, and the release ZIP passed structural/version/export/architecture validation.
- That package is installed in **64-bit Notepad++ 8.8.5**. All **61 installed payload files** matched the validated ZIP immediately after installation and again at `2026-10-02T01:32:12.394125+00:00`; the later host-architecture/payload audit is referenced in section 7. Recheck after any rebuild or installation.
- **First development priority:** the valid expression `\sqrt{x^2 + y^2}` loses its radical and overbar. This is visible in both the user's exported PDF and their live Notepad++ screenshot. The defect is confirmed; its mechanism has **not** been confirmed or fixed.
- Interactive Codex Computer Use works on this computer. Pi's isolated background Codex tasks could initialize the runtime but were denied access to Notepad++. Do not assume those sessions share the interactive session's approvals.

## 1. Start here and preserve existing work

Current checkout:

```text
C:\Users\ducle\OneDrive\Apps\notepad-viewer-plus
```

Read before implementation:

1. [AGENTS.md](AGENTS.md) — architecture, security invariants, ownership, build/package conventions.
2. [README.md](README.md) — implemented foundation and validation limits.
3. [NEW-COMPUTER-SETUP.md](NEW-COMPUTER-SETUP.md) — complete setup and smoke-test procedure.
4. [docs/onedrive-development.md](docs/onedrive-development.md) — local native output and synchronization safety.
5. [docs/syntax-support.md](docs/syntax-support.md), [docs/security-model.md](docs/security-model.md), and the relevant architecture/phase plans before changing behavior.

Git snapshot at handover:

- Branch: `master`.
- HEAD: `46bd9dff4ebe6e4b9cf462791d8c9dea89ddeb41`.
- **Many pre-existing uncommitted modifications, deletions, and untracked source/documentation files are intentional.** HEAD is not a complete description of the current working tree.
- Do not reset, clean, restore deleted legacy binaries, stage everything, commit, or push as part of setup/handover. Inspect `git status --short` and isolate your own changes.
- Source changes were preserved during setup; no application-source fix was made for the rendering defect.
- Do not run `Rename-ProjectFolder.ps1`; this checkout already has its canonical name.
- The bundled Notepad++ SDK has its own nested Git repository and is recorded as a gitlink without `.gitmodules`. Use the downloaded SDK; do not bootstrap with `git submodule update`.

Work on one computer/agent at a time. `.gitignore` does not exclude files from OneDrive. Verify OneDrive is **Up to date** before switching computers; cloud sync completion was not verified by Pi. No publication or remote push is authorized by this handover.

## 2. Verified environment on this computer

| Item | Observed value/location |
| --- | --- |
| Canonical release version | `version.json`: `0.3.0` |
| Git | `2.49.0.windows.1` |
| Node.js / npm | `22.15.0` / `11.14.1` |
| Visual Studio | VS 2022 Build Tools, custom installation at `C:\BuildTools2022` |
| MSVC | `14.44.35207`, x64/x86 tools present; x64 build validated |
| CMake / CTest / CPack | `3.31.6-msvc6` bundled with Visual Studio |
| Windows SDK | Configure selected `10.0.26100.0`; SDK installer completed with exit code `0` |
| Notepad++ | `8.8.5`, executable PE architecture verified as x64 |
| Notepad++ executable | `C:\Program Files\Notepad++\notepad++.exe` |
| WebView2 Evergreen Runtime | `154.0.4258.48` |
| x64 VC Runtime DLLs | `MSVCP140.dll`, `VCRUNTIME140.dll`, `VCRUNTIME140_1.dll`: `14.50.35719.0` |
| Codex CLI | `0.160.0`; authenticated without exposing credentials |

Setup fixed two PATH omissions. These directories were added to the **user PATH**:

```text
C:\BuildTools2022\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin
C:\BuildTools2022\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64
```

Restart the terminal/Codex parent process to inherit them. The second entry supplies `dumpbin.exe`; the package validator's fallback searches standard VS locations and did not discover the custom `C:\BuildTools2022` installation. An MSVC upgrade may require updating that version-specific entry. These are machine-local facts, not paths to hard-code into project source.

The initial native probe failed with `WindowsSDKDir` undefined and `LNK1181: cannot open input file 'kernel32.lib'`. Installing the signed Microsoft Windows SDK resolved that blocker; no compiler-path workaround in source was needed.

## 3. Build, test, package, and install

Use PowerShell from the project root. Prefer the OneDrive-safe helper rather than creating native build directories inside the checkout:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-Development.ps1 -Architecture x64 -Package
```

Dependencies were already reinstalled with `npm ci` on this computer. Add `-InstallDependencies` after changing computers or when a clean dependency installation is required. Omit `-Architecture x64` only when intentionally validating both architectures.

The helper checks renderer metadata, TypeScript, tests, production build, and strict asset sizes; then performs native configure/build/CTest, CPack, and package validation. Require **Development validation completed**. Do not install output from a failed validation run.

For focused renderer changes:

```powershell
Push-Location .\renderer
npm.cmd run version:check
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run size:strict
Pop-Location
```

### Current validated package

```text
C:\Users\ducle\AppData\Local\NotepadViewerPlus\development\d902d296cb0e\x64\packages\NotepadViewerPlus-0.3.0-x64.zip
```

- Size: `3,466,050` bytes.
- SHA-256: `01144a38d2af345846334cbd5cf5e697da28981cd45582fce577c8c5b287725f`.
- DLL version: `0.3.0.0`; architecture: `x64`.
- Validation report: the same ZIP path plus `.validation.json`.
- Validation timestamp: `2026-10-02T00:38:34.7391886Z`.
- Native output is machine-local, outside OneDrive. The checkout hash changes when the checkout path changes.

These identify the handover build. Future source changes require a **new** build/report; the helper prints its exact package path. Root ZIPs are retained artifacts and are not updated by `-Package`.

### Install a newly validated build

Save your documents and close **all Notepad++ instances yourself**. Do not force-close them. Confirm the host architecture, then use explicit paths:

```powershell
$zip = 'C:\Users\ducle\AppData\Local\NotepadViewerPlus\development\d902d296cb0e\x64\packages\NotepadViewerPlus-0.3.0-x64.zip'
powershell -NoProfile -ExecutionPolicy Bypass -File .\packaging\install-plugin.ps1 -ZipPath "$zip" -NotepadRoot 'C:\Program Files\Notepad++'
```

Replace `$zip` with the path from your latest successful build. The installer requests administrator permission and preserves an existing plugin directory as a rollback backup. The user must handle approval prompts.

Installed plugin directory:

```text
C:\Program Files\Notepad++\plugins\NotepadViewerPlus
```

Building alone does not update the installed plugin. Follow `AGENTS.md` for version synchronization and the required versioned installer wrapper; the existing `Install-NotepadViewerPlus-0.3.0.ps1` matched its template. Do not rely on that wrapper's retained-root-ZIP default for a newly built machine-local package.

### Shell cautions observed during setup

- When Windows PowerShell 5.1 is launched from a PowerShell 7-based environment, inherited `PSModulePath` can interfere with module loading. A process-local remedy used during setup was `$env:PSModulePath = "$PSHOME\Modules;" + $env:PSModulePath`; do not change global policy to work around it.
- Redirecting all helper streams inside Windows PowerShell 5.1 caused a Vite stderr warning to become a terminating `NativeCommandError`. Running the helper normally, or capturing output outside PowerShell, avoided that logging artifact. Do not suppress real nonzero exit codes.
- Vite warned about browser externalization of Node's `url` module in bundled PlantUML code and about large lazy chunks. Build/strict size validation passed; valid PlantUML diagrams appeared in the PDF. These warnings are not proof of a runtime defect.
- Use the package validator's default report path. Its pre-existing custom `-ReportPath` behavior can overwrite another file; never point it at the ZIP or a valuable artifact.

## 4. First task: missing square-root geometry

### Confirmed reproduction

Open `tests\syntax-showcase.md`, show **Plugins → Notepad Viewer Plus → Toggle Preview** (or **Ctrl+Alt+P**), and navigate to section 4.

Valid source:

```tex
$a^2 + b^2 = c^2$ and $\sqrt{x^2 + y^2}$
```

Expected: the second formula has both the radical and an overbar. Observed: **x² + y²** without either. The user's PDF page 3 and their live-preview screenshot both show this; it is **not just a printing-only symptom**. The nearby Pythagorean expression and displayed integral appear rendered.

### Investigation entry points — not a confirmed root cause

| File | Responsibility / check |
| --- | --- |
| `renderer/src/markdown/math.ts` | Expression extraction, placeholder IDs, iframe lifecycle, response dimensions, cancellation |
| `renderer/src/markdown/math-frame.ts` | KaTeX generation with `trust: false`, sanitization, measurement |
| `renderer/src/security/sanitize.ts` | `sanitizeGeneratedMath`, permitted markup and inline layout properties |
| `renderer/math-frame.html` | Frame styling/CSP and clipping/layout context |
| `renderer/src/ui/styles.css` | Host layout and any future print rules |
| `renderer/tests/security.test.ts` | Existing generated-math sanitization/security coverage |
| `renderer/tests/pipeline.test.ts` | Expression/placeholder pipeline coverage |
| `tests/syntax-showcase.md` | Integrated visual regression fixture |

A **candidate to test** is removal of KaTeX-generated SVG geometry: the inspected math sanitizer enables HTML/MathML profiles without an SVG profile. Compare KaTeX's original output with the sanitized DOM, then check frame dimensions, CSS, and actual WebView2 rendering. This is an investigation lead, **not an established mechanism**. The math style allowlist is another relevant boundary to inspect.

Do not fix the symptom by disabling DOMPurify, broadly trusting SVG/HTML, setting KaTeX `trust: true`, or removing iframe/CSP protections. Preserve the separate HTML, math, and diagram sanitizer boundaries.

### Acceptance criteria

1. Reproduce the defect before changing code and establish the actual mechanism.
2. Add a regression test exercising real generated KaTeX output through the relevant sanitization/render path, not only placeholder creation.
3. Cover inline/display roots and representative other generated geometry; retain tests that reject scripts, unsafe URLs, event handlers, and unsafe CSS.
4. Verify the radical and overbar visually in the **installed** Notepad++ preview and in a fresh PDF export, including light/dark behavior if affected.
5. Verify the neighboring formulas and malformed examples remain correct/localized.
6. Pass renderer checks, native tests, fresh package validation, and the relevant live smoke tests. Update documentation if the rendering/security contract changes.

No rendering fix was implemented during this handover.

## 5. Other observed issues and validation scope

### PDF review

The user exported the showcase to `C:\Users\ducle\Downloads\Notepad Viewer Plus.pdf` (10 pages). Visual inspection found:

- All 10 sections and the final paragraph are present.
- Tables, highlighted code, callouts, the local chart, and valid Mermaid/PlantUML diagrams appear rendered.
- Invalid math, Mermaid, and PlantUML examples intentionally produce local errors; following content survives. The blocked remote-image fallback is also intentional.
- **Print polish:** Copy buttons and a PlantUML menu control are printed. Some headings are separated from their content by page breaks. Consider narrow print-specific rules without changing screen behavior.
- **Fixture wording mismatch:** the showcase says raw HTML should appear as escaped literal markup, while `docs/syntax-support.md` and pipeline defaults allow sanitized raw HTML. The PDF displays the span's text without literal tags. Reconcile the fixture/documented behavior; this observation does not establish unsafe script execution.

PDF appearance does not prove network requests were blocked, JavaScript could not execute, live refresh works, or the plugin's separate PDF viewer adapter is correct.

### Still pending

- Live edit/auto-refresh and generation cancellation under rapid changes.
- Light/dark/system themes across supported formats.
- Dock visibility/closed-state persistence after a user-controlled restart.
- PDF viewer, OpenAPI CSP/network behavior, image/SVG backgrounds.
- Toolbar/DPI and clean-install/upgrade/Plugin Admin compatibility matrix.
- Fresh x86 build/package validation on this computer if needed; this setup validated **x64 only**.
- Publication rights/project source and binary licensing before any public release.

Do not upgrade “36 tests passed” into “all UI/security/runtime behaviors verified.”

## 6. Codex Computer Use and the Pi delegation lesson

The user's interactive Codex CLI session successfully invoked Windows Computer Use, inspected the actual Notepad++ preview, and navigated to section 4. Prefer that working session for live visual testing.

The advertised installed skill was:

```text
C:\Users\ducle\.codex\plugins\cache\openai-bundled\computer-use\26.928.20755\skills\computer-use\SKILL.md
```

This is a versioned local installation; use the skill path advertised by the current Codex session if it changes. Read the skill and its bundled `guidance.md`, `api.md`, and `confirmations.md` completely before automation.

The documented Windows entry point is `@oai/sky` in the persistent `node_repl` JavaScript session (exposed as `mcp__node_repl__js` during these tests). The generic `mcp__cua_repl.js` has a different API and was not the correct entry point.

Use returned app/window objects, require a unique target, observe before acting, refresh after each action, and do not reuse stale coordinates/indexes. Follow the skill's screenshot-handling rules. Stop on a locked desktop or approval denial. Never automate authentication/security prompts, terminal commands through UI, or Codex itself; do not bypass approval/sandbox boundaries.

Pi tested separate tasks with:

```text
codex --no-daemon -a never exec --sandbox read-only --ephemeral ...
```

Those tasks initialized `@oai/sky` and eventually found Notepad++, but capture was denied with **“Computer Use was not approved to use Notepad++.”** The user then demonstrated successful capture/navigation in their interactive session.

**Established:** the sessions/invocation policies differ; the runtime is installed and interactive Computer Use works. **Not established:** which internal authorization gate caused the background denial, or whether changing one flag would resolve it. Do not claim read-only universally blocks Computer Use or that Codex CLI cannot control Windows apps.

`codex queue --thread <session-id-or-exact-name> --message <task>` is advertised as a way to send work to an existing session. Delegation via the working session/shared daemon is a possible future integration test, **not a verified solution**. Do not resume/queue into unrelated sessions or change permissions without user direction.

## 7. Evidence references

Machine-local/session artifacts are optional supporting evidence, not required project dependencies. Temporary files can disappear; reproduce critical observations if missing.

| Evidence | Location |
| --- | --- |
| Successful build/test/package log | `%TEMP%\nvp-setup-validation.log` |
| ZIP validation report | Current machine-local ZIP path plus `.validation.json` |
| Installed-payload and x64 host audit | `%TEMP%\nvp-installed-payload-verification.json` (61 files, zero mismatches, ZIP SHA-256 matched; `2026-10-02T01:32:12.394125+00:00`) |
| User PDF | `C:\Users\ducle\Downloads\Notepad Viewer Plus.pdf` |
| Derived PDF pages/text | `%TEMP%\nvp-pdf-inspection\` (generated outside the checkout) |
| User live-preview screenshot | `%TEMP%\pi-clipboard-69181da6-80c2-4bce-ae4d-e773a12341eb.png` |
| Background Computer Use denial summary | `%TEMP%\nvp-codex-visual-retry.txt` |

The PDF and live screenshot were independently reviewed during the Pi session. They establish the missing radical's visible symptom, not its root cause. Do not copy unrelated user window titles, tokens, credentials, or sensitive payloads into persistent reports.

## 8. Suggested opening prompt for Codex

> Read AGENTS.md, CODEX-HANDOVER.md, README.md, and NEW-COMPUTER-SETUP.md in this checkout. Preserve all pre-existing uncommitted work. First reproduce the missing radical/overbar for `\sqrt{x^2 + y^2}` in tests/syntax-showcase.md using the Windows computer-use skill in this interactive session. Trace and verify the actual mechanism before proposing a narrow fix. Preserve sanitizer/CSP/iframe protections and add generated-math/security regression coverage. Run renderer checks and the OneDrive-safe x64 build/package validator, then arrange user-approved installation and visual preview/PDF validation. Do not force-close Notepad++, bypass permission prompts, publish, push, or commit automatically. Keep observed facts, hypotheses, and unverified checks separate.
