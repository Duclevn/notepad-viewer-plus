# Project name migration

## Canonical identities

- Checkout folder: `notepad-viewer-plus`
- Product: **Notepad Viewer Plus**
- Native target, DLL, plugin install folder, and release prefix: `NotepadViewerPlus`
- Renderer package: `notepad-viewer-plus-renderer`

The public identities are already migrated. An old checkout folder and generated build output can remain after that change; they are not evidence that current ZIPs still use the old DLL identity.

## Finish an old-path checkout migration

A running Pi session retains its original working directory. Windows may also prevent renaming a directory used by Pi, an IDE, or a shell. Close those applications first. Open PowerShell **outside** the checkout, then run the helper by its full path:

```powershell
& 'C:\Users\duc.le_unifiedpost\tools\markdown-preview-plus\Rename-ProjectFolder.ps1' -WhatIf
& 'C:\Users\duc.le_unifiedpost\tools\markdown-preview-plus\Rename-ProjectFolder.ps1'
```

The helper asks for confirmation. It refuses an existing destination, linked Git metadata/worktrees/submodules, checkouts hosting linked worktrees, linked project/build directories, and unverifiable build directories. It preserves source files, `.git` history and worktree changes, dependencies, installers, and release ZIP bytes. After a successful folder move it removes only native `build` / `build-*` directories whose CMake cache identifies this checkout, then deletes machine-local ZIP validation reports and validates existing current-version x64/x86 ZIPs at their new paths.

If the folder move fails, no build directories or reports have been deleted. If a later cleanup or package validation fails, the folder may already have moved: follow the reported error and rerun the helper from the **new** folder. Do not consume old reports or generate Plugin Admin metadata until package validation succeeds. Missing current-version packages are reported, not rebuilt automatically.

Reopen Pi in the canonical checkout's current location. This checkout subsequently moved to `C:\Users\duc.le_unifiedpost\OneDrive\Apps\notepad-viewer-plus`; follow [OneDrive development](onedrive-development.md) and use `Build-Development.ps1` there. The historical rename examples above describe the earlier folder-name migration only.

For a non-synced checkout, configure fresh build trees; moving or text-editing a CMake cache is not sufficient:

```text
cmake -S . -B build -G "Visual Studio 17 2022" -A x64 -DNPP_SDK_DIR="third_party/npp-plugin-template" -DWEBVIEW2_SDK_DIR="third_party/Microsoft.Web.WebView2"
cmake --build build --config Release
ctest --test-dir build -C Release --output-on-failure

cmake -S . -B build-x86 -G "Visual Studio 17 2022" -A Win32 -DNPP_SDK_DIR="third_party/npp-plugin-template" -DWEBVIEW2_SDK_DIR="third_party/Microsoft.Web.WebView2"
cmake --build build-x86 --config Release
ctest --test-dir build-x86 -C Release --output-on-failure
```

The renderer's `npm run lint`, `npm test`, `npm run version:check`, and `npm run build` commands remain unchanged. Rebuilding/repackaging changes ZIP hashes; run the package validator again afterward. The helper tests run with:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tests/packaging/ProjectFolderMigrationTests.ps1
```

No Git remote or external repository is renamed by this local operation.

## Intentional old-name references

Do not perform a global search-and-replace:

- `native/settings/SettingsService.cpp` reads legacy INI names so existing settings survive an upgrade.
- `native/plugin/PluginEntry.cpp` detects the legacy DLL to prevent conflicting dock panels.
- Phase plans retain explicitly historical baseline/upgrade references.
- Toolbar artwork provenance references a separate upstream repository and its exact source commit; changing that URL would corrupt attribution.
- This migration guide/helper necessarily identify the old checkout as the migration source.
- Git history retains historical filenames. Old release ZIPs already deleted in the working tree stay in history until normal commits record their deletion; history rewriting is not needed.

Generated native builds, CPack staging, root ZIPs/reports, and generated installer wrappers are ignored for future additions. Ignore rules do not untrack previously committed files. Keep existing legacy-artifact deletions in the eventual user-reviewed commit; this cleanup does not stage, commit, or reset other work. The older new-name 0.2.2 ZIP/installer are retained as potential rollback artifacts, not relabeled as current releases.
