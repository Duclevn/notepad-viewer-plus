[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$source = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\', '/')
$parent = Split-Path -Parent $source
$destination = Join-Path $parent 'notepad-viewer-plus'
# This is a migration source name, not the current product identity.
$legacyRoot = Join-Path $parent 'markdown-preview-plus'
if ((Split-Path -Leaf $source) -notin @('markdown-preview-plus', 'notepad-viewer-plus')) {
    throw 'Run this helper only from the original or canonical project folder.'
}
$gitDirectory = Join-Path $source '.git'
if (-not (Test-Path -LiteralPath $gitDirectory -PathType Container)) {
    throw 'Linked Git worktrees/submodules need Git-aware relocation; this helper requires a standalone checkout.'
}
if ((Get-Item -LiteralPath $gitDirectory -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint -or
    (Test-Path -LiteralPath (Join-Path $gitDirectory 'worktrees'))) {
    throw 'Linked Git metadata or a checkout hosting linked worktrees needs Git-aware relocation.'
}
foreach ($required in @('CMakeLists.txt', 'version.json', 'packaging\plugin-admin\validate-package.ps1')) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $required) -PathType Leaf)) {
        throw "Project marker is missing: $required"
    }
}
if ((Get-Item -LiteralPath $source).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
    throw 'Refusing to rename a linked project directory.'
}
$needsMove = -not $source.Equals($destination, [System.StringComparison]::OrdinalIgnoreCase)
if ($needsMove -and (Test-Path -LiteralPath $destination)) {
    throw "Destination already exists; nothing was changed: $destination"
}
$version = [string](Get-Content -LiteralPath (Join-Path $source 'version.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version in version.json.' }

# Never remove an arbitrary directory just because its name starts with build.
$buildNames = @()
foreach ($directory in @(Get-ChildItem -LiteralPath $source -Directory | Where-Object { $_.Name -eq 'build' -or $_.Name -like 'build-*' })) {
    if ($directory.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "Refusing to remove a linked build directory: $($directory.FullName)"
    }
    $cache = Join-Path $directory.FullName 'CMakeCache.txt'
    if (-not (Test-Path -LiteralPath $cache -PathType Leaf)) {
        throw "Cannot verify generated build directory; inspect it manually: $($directory.FullName)"
    }
    $cacheText = Get-Content -LiteralPath $cache -Raw
    $sourceMarker = [regex]::Match($cacheText, '(?m)^CMAKE_HOME_DIRECTORY:INTERNAL=([^\r\n]+)')
    if (-not $sourceMarker.Success) { throw "CMake source marker is missing: $cache" }
    $homePath = [System.IO.Path]::GetFullPath($sourceMarker.Groups[1].Value).TrimEnd('\', '/')
    if (-not $homePath.Equals($source, [System.StringComparison]::OrdinalIgnoreCase) -and
        -not $homePath.Equals($legacyRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Build cache belongs to another source tree; nothing was changed: $cache"
    }
    $buildNames += $directory.Name
}

$action = 'Rename checkout, discard verified generated native builds, and refresh current release ZIP reports. Close Pi, IDEs, and shells using the checkout first.'
if (-not $PSCmdlet.ShouldProcess($destination, $action)) { return }

# Release both PowerShell and native process working directories before moving.
Set-Location -LiteralPath $parent
[System.Environment]::CurrentDirectory = $parent
if ($needsMove) {
    try {
        Move-Item -LiteralPath $source -Destination $destination
    } catch {
        throw "Folder rename failed. Close Pi/IDEs and other processes using the checkout, then retry from outside it. Original error: $($_.Exception.Message)"
    }
}
Write-Host "Project folder: $destination"

foreach ($name in $buildNames) {
    $build = Join-Path $destination $name
    Remove-Item -LiteralPath $build -Recurse -Force
    if (Test-Path -LiteralPath $build) { throw "Generated build cleanup failed: $build" }
}

# Reports contain absolute ZIP paths. Invalidate them, then use the real validator;
# never manually rewrite a validator-backed report or alter package bytes.
foreach ($report in @(Get-ChildItem -LiteralPath $destination -Filter 'NotepadViewerPlus-*.zip.validation.json' -File)) {
    Remove-Item -LiteralPath $report.FullName -Force
}
$validator = Join-Path $destination 'packaging\plugin-admin\validate-package.ps1'
foreach ($architecture in @('x64', 'x86')) {
    $zip = Join-Path $destination "NotepadViewerPlus-$version-$architecture.zip"
    if (Test-Path -LiteralPath $zip -PathType Leaf) {
        & $validator -ZipPath $zip -Architecture $architecture
    } else {
        Write-Warning "No current $architecture ZIP to validate: $zip"
    }
}
Write-Host 'Migration completed. Reopen Pi in the new folder and configure fresh native builds before development.' -ForegroundColor Green
