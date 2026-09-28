# Notepad++ distribution

## Local package

Notepad++ Plugin Admin packages are architecture-specific ZIP files. The ZIP must contain the plugin DLL directly at its root, with the same basename as the plugin folder, plus the `assets/` directory:

```text
MarkdownPreviewPlus-0.1.4-x64.zip
├── MarkdownPreviewPlus.dll
├── THIRD-PARTY-LICENSES.txt
└── assets/
    ├── index.html
    └── ...
```

After configuring and building the native target, create the package with:

```text
cpack --config build/CPackConfig.cmake -C Release
```

The resulting `MarkdownPreviewPlus-<version>-x64.zip` or `...-x86.zip` can be manually installed by extracting its contents to:

```text
<Notepad++>\plugins\MarkdownPreviewPlus\
```

Restart Notepad++ after extraction. The x86 ZIP must be used with 32-bit Notepad++; the x64 ZIP must be used with 64-bit Notepad++.

## Official Plugin Admin

A ZIP file alone does not make a plugin appear in Plugin Admin. The official list requires a public, stable HTTPS download URL and a pull request to the [Notepad++ Plugin List repository](https://github.com/notepad-plus-plus/nppPluginList). See the repository's `src/pl.x86.json` and `src/pl.x64.json` manifests for the current schema.

The list has separate manifests for x86, x64, and ARM64. Generate the entry for an exact uploaded ZIP with:

```text
node packaging/plugin-admin/generate-entry.mjs ^
  --zip=release/MarkdownPreviewPlus-0.1.4-x64.zip ^
  --arch=x64 --version=0.1.4 ^
  --repository=https://github.com/<owner>/<repo>/releases/download/v0.1.4/MarkdownPreviewPlus-0.1.4-x64.zip ^
  --author="Your name" --homepage=https://github.com/<owner>/<repo>
```

The list entry includes:

- `folder-name`: `MarkdownPreviewPlus`
- `display-name`: `Markdown Preview Plus`
- `version`
- `id`: SHA-256 of the exact architecture ZIP
- `repository`: direct ZIP download URL
- `npp-compatible-versions`
- `description`, `author`, and `homepage`

Do not publish a manifest entry until the exact ZIP is uploaded and its SHA-256 has been calculated. This repository does not currently publish release ZIPs or have a public release URL, so it cannot yet be installed through Plugin Admin.
