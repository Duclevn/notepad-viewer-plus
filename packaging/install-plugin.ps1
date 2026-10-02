[CmdletBinding()]
param(
    [string]$ZipPath,
    [string]$TargetDir,
    [string]$NotepadRoot
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-LatestPackage {
    $directories = @()
    if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
        $directories += Split-Path -Parent $PSScriptRoot
    }
    $directories += Join-Path $HOME '.pi\Generated'

    foreach ($directory in $directories) {
        if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
            continue
        }
        $candidate = Get-ChildItem -LiteralPath $directory -Filter 'NotepadViewerPlus-*.zip' -File |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($candidate) {
            Write-Verbose "Selected plugin package: $($candidate.FullName)"
            return $candidate.FullName
        }
    }

    return $null
}

function Find-NotepadRoot {
    param([string]$RequestedRoot)

    if (-not [string]::IsNullOrWhiteSpace($RequestedRoot)) {
        $resolved = [System.IO.Path]::GetFullPath($RequestedRoot)
        if (-not (Test-Path -LiteralPath (Join-Path $resolved 'notepad++.exe') -PathType Leaf)) {
            throw "Notepad++ executable was not found under: $resolved"
        }
        return $resolved
    }

    $candidates = foreach ($base in @($env:ProgramW6432, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if (-not [string]::IsNullOrWhiteSpace($base)) { Join-Path $base 'Notepad++' }
    }
    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $candidates += Join-Path $env:LOCALAPPDATA 'Programs\Notepad++'
    }
    $candidates = $candidates | Select-Object -Unique

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath (Join-Path $candidate 'notepad++.exe') -PathType Leaf) {
            return [System.IO.Path]::GetFullPath($candidate)
        }
    }

    throw 'Notepad++ was not found. Re-run with -NotepadRoot "C:\path\to\Notepad++".'
}

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if ([string]::IsNullOrWhiteSpace($ZipPath)) {
    $ZipPath = Get-LatestPackage
}
if ([string]::IsNullOrWhiteSpace($ZipPath) -or -not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) {
    throw 'No Notepad Viewer Plus ZIP was found. Build/package the release first.'
}
$ZipPath = [System.IO.Path]::GetFullPath($ZipPath)

if ([string]::IsNullOrWhiteSpace($TargetDir)) {
    $NotepadRoot = Find-NotepadRoot -RequestedRoot $NotepadRoot
    $TargetDir = Join-Path $NotepadRoot 'plugins\NotepadViewerPlus'
} else {
    $TargetDir = [System.IO.Path]::GetFullPath($TargetDir)
}

$running = Get-Process -Name 'notepad++' -ErrorAction SilentlyContinue
if ($running) {
    Write-Host 'Please close Notepad++ before installing the plugin.' -ForegroundColor Yellow
    [void](Read-Host 'Press Enter after closing Notepad++')
    if (Get-Process -Name 'notepad++' -ErrorAction SilentlyContinue) {
        throw 'Notepad++ is still running; installation was cancelled.'
    }
}

if (-not (Test-IsAdministrator)) {
    Write-Host 'Requesting administrator permission to install under the Notepad++ directory...'
    $arguments = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', ('"' + $PSCommandPath + '"'),
        '-ZipPath', ('"' + $ZipPath + '"'),
        '-TargetDir', ('"' + $TargetDir + '"')
    )
    $elevated = Start-Process -FilePath (Get-Command powershell.exe).Source -Verb RunAs -ArgumentList $arguments -Wait -PassThru
    exit $elevated.ExitCode
}

$staging = Join-Path ([System.IO.Path]::GetTempPath()) ('NotepadViewerPlus-install-' + [guid]::NewGuid().ToString('N'))
$backup = $null
$targetInstalled = $false
try {
    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $staging -Force

    if (-not (Test-Path -LiteralPath (Join-Path $staging 'NotepadViewerPlus.dll') -PathType Leaf) -or
        -not (Test-Path -LiteralPath (Join-Path $staging 'assets\index.html') -PathType Leaf) -or
        -not (Test-Path -LiteralPath (Join-Path $staging 'THIRD-PARTY-LICENSES.txt') -PathType Leaf)) {
        throw 'The ZIP is missing NotepadViewerPlus.dll, assets/index.html, or THIRD-PARTY-LICENSES.txt.'
    }
    $rootDlls = @(Get-ChildItem -LiteralPath $staging -Filter '*.dll' -File)
    if ($rootDlls.Count -ne 1 -or $rootDlls[0].Name -cne 'NotepadViewerPlus.dll') {
        throw 'The ZIP must contain exactly NotepadViewerPlus.dll at its root.'
    }

    $parent = Split-Path -Parent $TargetDir
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    if (Test-Path -LiteralPath $TargetDir) {
        $backup = $TargetDir + '.backup-' + [guid]::NewGuid().ToString('N')
        Move-Item -LiteralPath $TargetDir -Destination $backup
    }

    Move-Item -LiteralPath $staging -Destination $TargetDir
    $staging = $null
    $targetInstalled = $true
    Write-Host "Notepad Viewer Plus installed to $TargetDir" -ForegroundColor Green
    if ($backup) {
        Write-Host "Previous installation kept at $backup" -ForegroundColor DarkGray
    }
    Write-Host 'Start or restart Notepad++ to load the new plugin.'
} catch {
    if ($targetInstalled -and (Test-Path -LiteralPath $TargetDir)) {
        Remove-Item -LiteralPath $TargetDir -Recurse -Force
    }
    if ($backup -and (Test-Path -LiteralPath $backup)) {
        Move-Item -LiteralPath $backup -Destination $TargetDir
    }
    throw
} finally {
    if ($staging -and (Test-Path -LiteralPath $staging)) {
        Remove-Item -LiteralPath $staging -Recurse -Force
    }
}
