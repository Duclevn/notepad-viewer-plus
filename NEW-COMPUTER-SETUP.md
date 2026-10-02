# New Computer Setup — Notepad Viewer Plus

## Quick overview

This guide lets another Windows computer continue development and run the Notepad++ plugin from the OneDrive-synced project.

- **Project folder:** `Apps\notepad-viewer-plus` inside your OneDrive folder. Your Windows username and OneDrive root can differ from the original computer.
- **Full development:** complete steps 1–7 below.
- **Run the existing plugin only:** complete step 1, install Notepad++, the WebView2 Runtime, and the matching Microsoft Visual C++ Runtime from step 2, then follow the existing-package option in step 6 and the smoke checks in step 7. Node.js and C++ build tools are not needed just to run an existing package.
- Work on **one computer at a time**. Wait for OneDrive to finish syncing before switching computers.

## 1. Download the complete project

1. On the previous computer, save your work, stop builds, close editors, and wait for OneDrive to report **Up to date**.
2. On the new computer, sign in to the same OneDrive account and enable syncing of `Apps\notepad-viewer-plus`.
3. In File Explorer, right-click the project folder and select **Always keep on this device**.
4. Wait until the entire folder is downloaded. Do not build or run Git while files are still downloading.
5. Open the project folder, right-click its background, and open PowerShell/Terminal there. Use a PowerShell shell for the commands below.

Confirm that you are in the correct directory:

```powershell
Get-Location
Test-Path .\AGENTS.md
Test-Path .\Build-Development.ps1
Test-Path .\version.json
Test-Path .\.git
Test-Path .\third_party\npp-plugin-template\src\PluginInterface.h
Test-Path .\third_party\Microsoft.Web.WebView2\build\native\include\WebView2.h
```

All `Test-Path` results should be `True`. If not, resolve the path/download problem first. Do not replace missing SDK files with an empty folder.

> Do not run `Rename-ProjectFolder.ps1` for this setup. The project is already at its canonical folder name.

## 2. Install prerequisites

Use official installers or your organization's approved software channel.

| Software | Requirement / purpose |
| --- | --- |
| Git for Windows | Preserve and inspect the existing repository; [official downloads](https://git-scm.com/downloads/win). |
| Node.js | **22.x, version 22.12 or later**; tested on the original computer with 22.23.2. Includes npm. Select the 22.x line rather than assuming the latest major version is compatible; [official downloads](https://nodejs.org/en/download). |
| CMake | **3.25 or later**, including CTest and CPack. Enable its PATH option; [official downloads](https://cmake.org/download/). |
| Visual Studio 2022 Build Tools | Install the **Desktop development with C++** workload, **MSVC v143 x64/x86** tools, and a Windows SDK. The build helper explicitly uses the **Visual Studio 17 2022** generator; a newer Visual Studio major alone is not a substitute. Use Microsoft's official/approved VS 2022 installer. |
| Notepad++ | Prefer **64-bit**. Version 8.0+ is the code's API baseline, not a fully verified compatibility matrix; use a supported version and run step 7. [Official downloads](https://notepad-plus-plus.org/downloads/). |
| Microsoft Edge WebView2 Evergreen Runtime | Required by the installed plugin and not included in the ZIP; [official downloads](https://developer.microsoft.com/en-us/microsoft-edge/webview2/). |
| Microsoft Visual C++ v14 Redistributable | Install the latest supported package matching the plugin/Notepad++ architecture: x64 for x64, x86 for x86; install both if using both. Required even for the runtime-only route and not bundled in the ZIP; [official downloads and compatibility guidance](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist). |
| Editor | Any suitable editor for C++ and TypeScript. |

The Notepad++ plugin SDK and WebView2 development SDK are already included in `third_party`. The WebView2 **SDK** does not replace the installed WebView2 **Runtime**.

Python 3 and Pillow are needed only if you regenerate toolbar artwork; they are not required for the normal build.

After installing tools, close and reopen the terminal so that PATH updates take effect.

## 3. Check the development environment and Git state

From the project root:

```powershell
git --version
node --version
npm.cmd --version
cmake --version
ctest --version
cpack --version
cmake --help | Select-String 'Visual Studio 17 2022'
git status --short
```

The CMake generator listing is only a preliminary check: the actual configure/build in step 4 verifies that the compiler and Windows SDK are usable.

The synced repository intentionally contains uncommitted changes and deletions from previous work. They are not setup errors. **Do not run `git reset --hard`, `git clean`, or discard changes just to get a clean status.** Do not stage or commit everything automatically.

The SDK folder `third_party/npp-plugin-template` contains its own Git repository, while the outer repository records it as a gitlink without `.gitmodules`. This is a pre-existing setup. Use the complete synced SDK folder; `git submodule update` is not a supported provisioning command for this checkout.

## 4. Install dependencies, build, test, and package

For the recommended 64-bit Notepad++ setup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-Development.ps1 -InstallDependencies -Architecture x64 -Package
```

To validate and package **both x64 and x86**, omit the architecture restriction:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-Development.ps1 -InstallDependencies -Package
```

Run one command, not both, unless you specifically need another build.

The helper:

1. Uses `npm ci` to reinstall dependencies from `renderer/package-lock.json` for this computer. Internet access to the configured npm registry is required.
2. Checks version consistency, TypeScript, renderer tests, the production renderer build, and strict asset size limits.
3. Configures fresh native builds with this computer's source/compiler paths.
4. Builds the plugin and runs native CTest suites.
5. With `-Package`, creates architecture-specific ZIPs and validates their structure, DLL version, exports, and PE architecture.

Wait for **Development validation completed**. If the command fails, stop and fix the reported error; do not install a package from a failed build. The original computer passed 36 renderer tests plus both native test suites after relocation; future source changes may legitimately change the test count.

The execution-policy option applies only to that PowerShell process; it does not change the system policy. Do not bypass organization-enforced policy or install unapproved tools—request approval if required.

## 5. Understand where build output goes

| Content | Location |
| --- | --- |
| Source, documentation, SDKs, Git history | The OneDrive project folder |
| Renderer dependencies | `renderer\node_modules` in the checkout |
| Built renderer | `renderer\dist` in the checkout |
| Native builds | `%LOCALAPPDATA%\NotepadViewerPlus\development\<checkout-path-hash>\x64` or `\x86` |
| Newly built release ZIPs/reports | The native build directory's `packages` subfolder |
| Installed plugin | The selected Notepad++ installation's `plugins\NotepadViewerPlus` folder |

The helper prints each exact **Validated ... package** path. Copy that path for installation. Do not copy a build directory from another computer, and do not create native build trees inside OneDrive using the old low-level examples.

**Important:** `-Package` does not replace the existing ZIPs in the project root. Those are retained packages, not necessarily the binaries from your latest source changes.

## 6. Install the plugin in Notepad++

Before closing Notepad++, check **Help (?) → About Notepad++** for its architecture and identify the folder containing that installation's `notepad++.exe`. Save your documents and close **all** Notepad++ instances.

Match the package to the **Notepad++ process architecture**, not merely the Windows architecture: x64 for 64-bit Notepad++, x86 for 32-bit Notepad++. Install the matching Visual C++ Runtime as well. ARM64 plugin packages are not supported.

Always pass the intended installation's `-NotepadRoot`, as shown below. This is especially important when x64 and x86 installations coexist: the installer's automatic discovery can choose the other installation. **`-ZipPath` does not select or validate the host architecture**, and `-NotepadRoot` checks executable presence, not architecture; verify the match yourself.

### Install your newly built package

From the project root, paste the exact package path printed in step 4, without surrounding quotes:

```powershell
$zip = Read-Host 'Paste the full validated package ZIP path'
$notepadRoot = Read-Host 'Paste the intended Notepad++ folder containing notepad++.exe'
powershell -NoProfile -ExecutionPolicy Bypass -File .\packaging\install-plugin.ps1 -ZipPath "$zip" -NotepadRoot "$notepadRoot"
```

The installer requests administrator permission, checks the essential payload, installs it, and preserves an existing plugin directory as a rollback backup. Read the reported installation and backup paths. The installer itself does not perform all the structural/PE checks from the package validator; building with `-Package` performs those first.

The same explicit `-NotepadRoot` command works for standard, portable, and custom installations. Supply the actual installation folder, not its `plugins` subfolder.

### Install a retained package without building

The checkout currently includes 0.3.0 packages. Read the canonical version rather than hard-coding it, and confirm that a matching retained package exists:

```powershell
$version = (Get-Content .\version.json -Raw | ConvertFrom-Json).version
$zip = Join-Path (Get-Location).Path "NotepadViewerPlus-$version-x64.zip"
if (-not (Test-Path -LiteralPath $zip)) { throw 'No matching retained package; build one using step 4.' }
$notepadRoot = Read-Host 'Paste the intended Notepad++ folder containing notepad++.exe'
powershell -NoProfile -ExecutionPolicy Bypass -File .\packaging\install-plugin.ps1 -ZipPath "$zip" -NotepadRoot "$notepadRoot"
```

Change `x64` to `x86` only for 32-bit Notepad++. A retained package may not include the latest uncommitted source changes. If you need those changes, build first.

Do not call the maintained installer without an explicit `-ZipPath`: its fallback package discovery may select a package for the wrong architecture.

## 7. Run and smoke-test the plugin

1. Start/restart the selected Notepad++ installation.
2. Check **Plugins → Notepad Viewer Plus → About Notepad Viewer Plus** and confirm the expected version.
3. Open `tests\syntax-showcase.md` from the project.
4. Select **Plugins → Notepad Viewer Plus → Toggle Preview**, click its toolbar button, or use **Ctrl+Alt+P**. The preview starts hidden unless Notepad++ restores an open panel.
5. Confirm that text/diagrams render and that edits update the preview.
6. Check light and dark themes, toggle the panel, and restart Notepad++ to check dock-state restoration.
7. Check representative supported formats you use, including image/PDF/OpenAPI behavior if relevant. See [syntax support](docs/syntax-support.md).

Automated build/test success does not prove that every Notepad++/WebView2 version behaves identically. PDF, toolbar/DPI, and install/upgrade compatibility still require manual checks. Runtime preview is offline by default; initial tool/dependency installation is not.

## 8. Continue development and switch computers safely

For normal rebuilds without reinstalling npm dependencies:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Build-Development.ps1 -Architecture x64 -Package
```

Use `-InstallDependencies` again after switching computers or when you need a clean dependency installation. Reinstall the newly built ZIP if you want Notepad++ to load your changes; building alone does not update the installed plugin.

For focused renderer work:

```powershell
Push-Location .\renderer
npm.cmd run lint
npm.cmd test
npm.cmd run build
Pop-Location
```

Before handing the checkout to another developer/assistant, read:

- [AGENTS.md](AGENTS.md): architecture, ownership, security invariants, and maintenance rules.
- [README.md](README.md): implementation status and supported workflows.
- [OneDrive development](docs/onedrive-development.md): migration evidence and known setup limitations.
- [Architecture plan](PLAN-AND-ARCHITECTURE.md), [Phase 2](PHASE-2-MULTI-FORMAT-PLAN.md), and [Phase 3](PHASE-3-PLUGIN-ADMIN-PUBLISHING-PLAN.md): project direction and pending work.

Before switching computers, save everything, stop builds/watchers, close editors, finish Git operations, and wait for OneDrive to report **Up to date**. Then wait for downloads to finish on the other computer.

`.gitignore` does **not** exclude files from OneDrive. `node_modules` and renderer output still sync. Never run builds, `npm ci`, or Git operations concurrently on two computers sharing this checkout. If conflicts appear, stop work and preserve both versions before resolving them. Do not add credentials/tokens to the synced repository. This company checkout's publication restrictions still apply: do not push or publish releases without approval.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Required tool not found | Install it, enable its PATH option, and reopen the terminal. |
| Visual Studio 17 2022 generator/compiler unavailable | Install VS **2022** Build Tools, MSVC v143 x64/x86, and a Windows SDK; rerun the helper. |
| SDK header or project file missing | Finish OneDrive downloading and verify the project folder. Do not use `git submodule update` as a substitute. |
| npm install fails | Check approved registry/proxy/network access and Node compatibility. Retry `-InstallDependencies` after correcting the problem; do not casually replace the lockfile. |
| PowerShell script blocked | Use the process-scoped commands shown above if allowed. Organization policy takes precedence. |
| Old source path in CMake errors | Use `Build-Development.ps1`, which configures fresh local native caches. Do not edit or reuse a synced old cache. |
| Root ZIP is older than source changes | Install the newly built ZIP from the helper's printed machine-local `packages` path. |
| Plugin missing or DLL fails to load | Confirm matching Notepad++/plugin architecture, installed WebView2 Runtime and Visual C++ v14 Redistributable, complete DLL/assets payload, and the correct Notepad++ installation; restart it. Both retained ZIPs import `MSVCP140.dll` and `VCRUNTIME140.dll`; x64 also imports `VCRUNTIME140_1.dll`. |
| Preview panel not visible | Use Toggle Preview; a fresh installation starts hidden by design. |
| Custom Notepad++ installation not found | Pass `-NotepadRoot` to the installer as shown in step 6. |
| OneDrive conflicts | Stop work on both computers; preserve conflicting copies and recover deliberately. Do not force a Git reset to hide the problem. |

**Package-validator safety:** if running `packaging/plugin-admin/validate-package.ps1` manually, use its default report path. A custom `-ReportPath` is an overwrite target and must never equal the ZIP path or another valuable file. Regenerate validation reports on this computer instead of editing reports synced from another path.

## Completion checklist

- [ ] The full OneDrive project, hidden Git metadata, and SDK files are downloaded.
- [ ] Development tools are available in the terminal (for the development route).
- [ ] Dependencies were installed on this computer and the build/tests/package validation passed.
- [ ] Native output is outside OneDrive.
- [ ] The correct-architecture package is installed in the intended Notepad++ installation.
- [ ] WebView2 Runtime and the matching Visual C++ v14 Redistributable are installed, and the plugin smoke checks pass.
- [ ] Existing source changes/Git history remain intact.
- [ ] OneDrive is up to date before switching computers.

Second-computer operation and cloud sync completion must be verified on that computer; the original computer's successful validation is not a substitute.
