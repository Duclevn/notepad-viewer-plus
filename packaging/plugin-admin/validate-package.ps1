[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ZipPath,

    [Parameter(Mandatory = $true)]
    [ValidateSet('x64', 'x86')]
    [string]$Architecture,

    [string]$ReportPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-NormalizedVersion {
    param([Parameter(Mandatory = $true)][string]$Version)

    $match = [regex]::Match($Version, '^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?')
    if (-not $match.Success) {
        throw "Version is not numeric: $Version"
    }
    $fourth = if ($match.Groups[4].Success) { $match.Groups[4].Value } else { '0' }
    return "$($match.Groups[1].Value).$($match.Groups[2].Value).$($match.Groups[3].Value).$fourth"
}

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)

    $stream = [System.IO.File]::OpenRead($Path)
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    } finally {
        $algorithm.Dispose()
        $stream.Dispose()
    }
}

function Get-PeArchitecture {
    param([Parameter(Mandatory = $true)][string]$Path)

    $stream = [System.IO.File]::OpenRead($Path)
    $reader = [System.IO.BinaryReader]::new($stream)
    try {
        if ($reader.ReadUInt16() -ne 0x5A4D) { throw 'DLL does not have an MZ header' }
        $stream.Position = 0x3C
        $peOffset = $reader.ReadUInt32()
        if ($peOffset -gt ($stream.Length - 6)) { throw 'DLL has an invalid PE offset' }
        $stream.Position = $peOffset
        if ($reader.ReadUInt32() -ne 0x00004550) { throw 'DLL does not have a PE signature' }
        switch ($reader.ReadUInt16()) {
            0x014C { return 'x86' }
            0x8664 { return 'x64' }
            0xAA64 { return 'arm64' }
            default { throw 'DLL has an unsupported PE machine type' }
        }
    } finally {
        $reader.Dispose()
        $stream.Dispose()
    }
}

function Find-Dumpbin {
    $command = Get-Command dumpbin.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $roots = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\2022'),
        (Join-Path $env:ProgramFiles 'Microsoft Visual Studio\2022')
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and (Test-Path -LiteralPath $_ -PathType Container) }

    foreach ($root in $roots) {
        $candidates = @(Get-ChildItem -LiteralPath $root -Filter dumpbin.exe -File -Recurse -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending)
        foreach ($suffix in @(
            '\Hostx64\x64\dumpbin.exe',
            '\Hostx64\x86\dumpbin.exe',
            '\Hostx86\x86\dumpbin.exe',
            '\Hostx86\x64\dumpbin.exe'
        )) {
            $candidate = $candidates | Where-Object {
                $_.FullName.EndsWith($suffix, [System.StringComparison]::OrdinalIgnoreCase)
            } | Select-Object -First 1
            if ($candidate) { return $candidate.FullName }
        }
    }
    throw 'dumpbin.exe was not found; install the Visual Studio C++ Build Tools to validate plugin exports'
}

function Get-PluginExports {
    param([Parameter(Mandatory = $true)][string]$DllPath)

    $dumpbin = Find-Dumpbin
    $output = & $dumpbin /nologo /exports $DllPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "dumpbin failed while inspecting plugin exports:`n$($output -join [Environment]::NewLine)"
    }
    $required = @('setInfo', 'getName', 'getFuncsArray', 'beNotified', 'messageProc', 'isUnicode')
    foreach ($name in $required) {
        if (-not ($output | Select-String -Pattern "\s$([regex]::Escape($name))(?:\s|$)" -Quiet)) {
            throw "DLL is missing required Notepad++ export: $name"
        }
    }
    return $required
}

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$versionData = Get-Content -LiteralPath (Join-Path $projectRoot 'version.json') -Raw | ConvertFrom-Json
$releaseVersion = [string]$versionData.version
if ($releaseVersion -notmatch '^\d+\.\d+\.\d+$') {
    throw 'version.json must contain a three-part numeric version'
}
$expectedDllVersion = Get-NormalizedVersion -Version $releaseVersion
$ZipPath = [System.IO.Path]::GetFullPath($ZipPath)
if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) {
    throw "Expected architecture ZIP is missing: $ZipPath"
}
if ([string]::IsNullOrWhiteSpace($ReportPath)) {
    $ReportPath = "$ZipPath.validation.json"
}
$ReportPath = [System.IO.Path]::GetFullPath($ReportPath)
if (Test-Path -LiteralPath $ReportPath) {
    Remove-Item -LiteralPath $ReportPath -Force
}

$expectedFileName = "NotepadViewerPlus-$releaseVersion-$Architecture.zip"
if ([System.IO.Path]::GetFileName($ZipPath) -cne $expectedFileName) {
    throw "ZIP filename must be $expectedFileName"
}

$temporary = Join-Path ([System.IO.Path]::GetTempPath()) ('NotepadViewerPlus-validate-' + [guid]::NewGuid().ToString('N'))
$archive = $null
try {
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    if ($entries.Count -eq 0) { throw 'ZIP is empty' }

    foreach ($entry in $entries) {
        if ([System.IO.Path]::IsPathRooted($entry) -or $entry.StartsWith('/') -or $entry -match '(^|/)\.\.(/|$)') {
            throw "ZIP contains an unsafe path: $entry"
        }
        if ($entry -match '(?i)(^|/)(\.env(?:\..*)?|credentials(?:\.json)?|secrets?(?:\..*)?|[^/]+\.(?:pdb|lib|exp|obj|ilk))$' -or
            $entry -match '(?i)(^|/)(?:\.git|build|node_modules)(/|$)') {
            throw "ZIP contains build-only or credential material: $entry"
        }
    }

    $rootDlls = @($entries | Where-Object { $_ -match '^[^/]+\.dll$' })
    if ($rootDlls.Count -ne 1 -or $rootDlls[0] -cne 'NotepadViewerPlus.dll') {
        throw 'ZIP must contain exactly NotepadViewerPlus.dll at its root; DLL basename must match folder-name'
    }
    foreach ($requiredEntry in @(
        'NotepadViewerPlus.dll',
        'THIRD-PARTY-LICENSES.txt',
        'assets/index.html',
        'assets/diagram-frame.html',
        'assets/math-frame.html',
        'assets/vendor/mermaid-tiny.js'
    )) {
        if ($entries -cnotcontains $requiredEntry) {
            throw "ZIP is missing required package entry: $requiredEntry"
        }
    }

    $archive.Dispose()
    $archive = $null
    New-Item -ItemType Directory -Path $temporary -Force | Out-Null
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $temporary)

    $dllPath = Join-Path $temporary 'NotepadViewerPlus.dll'
    $versionInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($dllPath)
    $observedDllVersion = Get-NormalizedVersion -Version ([string]$versionInfo.FileVersion)
    if ($observedDllVersion -ne $expectedDllVersion) {
        throw "DLL version $observedDllVersion does not match release version $expectedDllVersion"
    }
    $observedArchitecture = Get-PeArchitecture -Path $dllPath
    if ($observedArchitecture -ne $Architecture) {
        throw "DLL architecture $observedArchitecture does not match expected architecture $Architecture"
    }
    if ([string]$versionInfo.CompanyName -ne 'Duc Le' -or [string]$versionInfo.LegalCopyright -notmatch 'Duc Le') {
        throw 'DLL ownership metadata must identify Duc Le before publication'
    }

    $exports = @(Get-PluginExports -DllPath $dllPath)
    $sha256 = Get-Sha256 -Path $ZipPath
    $report = [ordered]@{
        schemaVersion = 1
        valid = $true
        zipPath = $ZipPath
        fileName = [System.IO.Path]::GetFileName($ZipPath)
        observedVersion = $releaseVersion
        observedDllVersion = $observedDllVersion
        observedArchitecture = $observedArchitecture
        sha256 = $sha256
        sizeBytes = (Get-Item -LiteralPath $ZipPath).Length
        companyName = [string]$versionInfo.CompanyName
        legalCopyright = [string]$versionInfo.LegalCopyright
        exports = $exports
        validatedAtUtc = [DateTime]::UtcNow.ToString('o')
    }
    $json = $report | ConvertTo-Json -Depth 4
    $reportDirectory = Split-Path -Parent $ReportPath
    if (-not [string]::IsNullOrWhiteSpace($reportDirectory)) {
        New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($ReportPath, "$json`r`n", [System.Text.UTF8Encoding]::new($false))
    Write-Output $json
} finally {
    if ($archive) { $archive.Dispose() }
    if (Test-Path -LiteralPath $temporary) {
        Remove-Item -LiteralPath $temporary -Recurse -Force
    }
}
