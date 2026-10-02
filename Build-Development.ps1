[CmdletBinding()]
param(
    [ValidateSet('x64', 'x86')]
    [string[]]$Architecture = @('x64', 'x86'),
    [switch]$InstallDependencies,
    [switch]$Package
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Resolve from this script, never from the caller's working directory or username.
$projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
foreach ($tool in @('node.exe', 'npm.cmd', 'cmake.exe', 'ctest.exe')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "Required tool is missing: $tool. See docs/onedrive-development.md."
    }
}
if ($Package -and -not (Get-Command cpack.exe -ErrorAction SilentlyContinue)) {
    throw 'Required tool is missing: cpack.exe.'
}
foreach ($file in @('version.json', 'renderer\package-lock.json',
    'third_party\npp-plugin-template\src\PluginInterface.h',
    'third_party\Microsoft.Web.WebView2\build\native\include\WebView2.h')) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $file) -PathType Leaf)) {
        throw "Project dependency is missing: $file. Finish downloading the OneDrive folder first."
    }
}
if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { throw 'LOCALAPPDATA is not set.' }

function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE. Build stopped."
    }
}

# A checkout-specific local directory prevents cross-machine CMake cache reuse
# and avoids collisions when this machine has multiple copies of the project.
$algorithm = [System.Security.Cryptography.SHA256]::Create()
try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant())
    $checkoutId = ([System.BitConverter]::ToString($algorithm.ComputeHash($bytes))).Replace('-', '').Substring(0, 12).ToLowerInvariant()
} finally {
    $algorithm.Dispose()
}
$localRoot = Join-Path $env:LOCALAPPDATA "NotepadViewerPlus\development\$checkoutId"
$renderer = Join-Path $projectRoot 'renderer'
Push-Location -LiteralPath $renderer
try {
    if ($InstallDependencies -or -not (Test-Path -LiteralPath (Join-Path $renderer 'node_modules\.bin\vite.cmd'))) {
        Invoke-Checked 'npm.cmd' @('ci')
    }
    foreach ($task in @('version:check', 'lint', 'test', 'build', 'size:strict')) {
        Invoke-Checked 'npm.cmd' @('run', $task)
    }
} finally {
    Pop-Location
}

$version = [string](Get-Content -LiteralPath (Join-Path $projectRoot 'version.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version in version.json.' }
foreach ($arch in @($Architecture | Select-Object -Unique)) {
    $build = Join-Path $localRoot $arch
    $platform = if ($arch -eq 'x64') { 'x64' } else { 'Win32' }
    Invoke-Checked 'cmake.exe' @('--fresh', '-S', $projectRoot, '-B', $build,
        '-G', 'Visual Studio 17 2022', '-A', $platform,
        "-DNPP_SDK_DIR=$(Join-Path $projectRoot 'third_party\npp-plugin-template')",
        "-DWEBVIEW2_SDK_DIR=$(Join-Path $projectRoot 'third_party\Microsoft.Web.WebView2')")
    Invoke-Checked 'cmake.exe' @('--build', $build, '--config', 'Release')
    Invoke-Checked 'ctest.exe' @('--test-dir', $build, '-C', 'Release', '--output-on-failure', '--no-tests=error')
    Write-Host "Validated $arch native build: $build"
    if ($Package) {
        $packages = Join-Path $build 'packages'
        Invoke-Checked 'cpack.exe' @('--config', (Join-Path $build 'CPackConfig.cmake'), '-C', 'Release', '-B', $packages)
        $zip = Join-Path $packages "NotepadViewerPlus-$version-$arch.zip"
        & (Join-Path $projectRoot 'packaging\plugin-admin\validate-package.ps1') -ZipPath $zip -Architecture $arch
        Write-Host "Validated $arch package: $zip"
    }
}
Write-Host 'Development validation completed. Native builds/packages are machine-local; source and renderer output remain in the checkout.' -ForegroundColor Green
