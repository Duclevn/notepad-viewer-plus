param(
    [string]$ZipPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'MarkdownPreviewPlus-0.1.4-x64.zip'),
    [string]$TargetDir = 'C:\Program Files\Notepad++\plugins\MarkdownPreviewPlus'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $ZipPath -PathType Leaf)) {
    throw "Plugin package not found: $ZipPath"
}
if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

Expand-Archive -Path $ZipPath -DestinationPath $TargetDir -Force
Write-Output "Installed successfully to $TargetDir. Restart Notepad++ to load the updated DLL."
