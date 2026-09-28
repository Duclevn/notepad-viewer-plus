# Notepad++ distribution

## Local package

Notepad Viewer Plus packages are architecture-specific ZIP files. The ZIP must contain the plugin DLL directly at its root, with the same basename as the plugin folder, plus the `assets/` directory:

```text
NotepadViewerPlus-0.2.0-x64.zip
├── NotepadViewerPlus.dll
├── THIRD-PARTY-LICENSES.txt
└── assets/
    ├── index.html
    └── ...
```

After configuring and building the native target, create the package with:

```text
cpack --config build/CPackConfig.cmake -C Release
```

The resulting `NotepadViewerPlus-<version>-x64.zip` or `...-x86.zip` can be manually installed by extracting its contents to:

```text
<Notepad++>\plugins\NotepadViewerPlus\
```

Restart Notepad++ after extraction. The x86 ZIP must be used with 32-bit Notepad++; the x64 ZIP must be used with 64-bit Notepad++.

For the local x64 build, close Notepad++ and run `~/.pi/Generated/Install-NotepadViewerPlus-0.2.0.ps1` with PowerShell. The script discovers the standard Notepad++ installation, elevates when required, validates the ZIP, and keeps a rollback backup. Use `-NotepadRoot` or `-TargetDir` for a portable/custom installation.

## Official Plugin Admin

A ZIP file alone does not make a plugin appear in Plugin Admin. The official list requires a public, stable HTTPS download URL and a pull request to the [Notepad++ Plugin List repository](https://github.com/notepad-plus-plus/nppPluginList). See its `src/pl.x86.json` and `src/pl.x64.json` manifests for the current schema.

Generate an entry for an exact uploaded ZIP with:

```text
node packaging/plugin-admin/generate-entry.mjs ^
  --zip=release/NotepadViewerPlus-0.2.0-x64.zip ^
  --arch=x64 --version=0.2.0 ^
  --repository=https://github.com/<owner>/<repo>/releases/download/v0.2.0/NotepadViewerPlus-0.2.0-x64.zip ^
  --author="Your name" --homepage=https://github.com/<owner>/<repo>
```

The list entry includes `folder-name: NotepadViewerPlus`, `display-name: Notepad Viewer Plus`, the version, SHA-256 of the exact architecture ZIP, direct ZIP URL, compatibility versions, description, author, and homepage.

Do not publish a manifest entry until the exact ZIP is uploaded and its SHA-256 has been calculated. The local project contains no verified public release URL.
