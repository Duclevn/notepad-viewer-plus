param(
    [string]$ZipPath = (Join-Path $HOME '.pi\Generated\NotepadViewerPlus-0.2.0-x64.zip'),
    [string]$TargetDir = 'C:\Program Files\Notepad++\plugins\NotepadViewerPlus'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $ZipPath -PathType Leaf)) {
    throw "Plugin package not found: $ZipPath"
}
if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

Expand-Archive -Path $ZipPath -DestinationPath $TargetDir -Force
Write-Output "Installed Notepad Viewer Plus successfully to $TargetDir. Restart Notepad++ to load the updated DLL."
