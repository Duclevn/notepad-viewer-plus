$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$helper = Join-Path $projectRoot 'Rename-ProjectFolder.ps1'
$powerShell = (Get-Command powershell.exe).Source
$temporary = Join-Path ([System.IO.Path]::GetTempPath()) ('NotepadViewerPlus-migration-tests-' + [guid]::NewGuid().ToString('N'))

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function New-Fixture {
    param([string]$Name)
    $parent = Join-Path $temporary $Name
    $source = Join-Path $parent 'markdown-preview-plus'
    foreach ($directory in @('.git', 'packaging\plugin-admin', 'build', 'build-x86', 'renderer\node_modules')) {
        New-Item -ItemType Directory -Path (Join-Path $source $directory) -Force | Out-Null
    }
    # Real Windows checkouts commonly mark .git hidden.
    [System.IO.File]::SetAttributes((Join-Path $source '.git'), ([System.IO.FileAttributes]::Directory -bor [System.IO.FileAttributes]::Hidden))
    Copy-Item -LiteralPath $helper -Destination (Join-Path $source 'Rename-ProjectFolder.ps1')
    [System.IO.File]::WriteAllText((Join-Path $source 'version.json'), '{"version":"0.3.0"}')
    foreach ($file in @('CMakeLists.txt', 'source.txt', '.git\history-marker', 'renderer\node_modules\dependency-marker')) {
        [System.IO.File]::WriteAllText((Join-Path $source $file), 'preserve me')
    }
    foreach ($name in @('build', 'build-x86')) {
        [System.IO.File]::WriteAllText((Join-Path $source "$name\CMakeCache.txt"), "CMAKE_HOME_DIRECTORY:INTERNAL=$source`r`n")
        [System.IO.File]::WriteAllText((Join-Path $source "$name\generated.obj"), 'generated')
    }
    # Stub only the external package validator; real release ZIP validation is separate.
    [System.IO.File]::WriteAllText((Join-Path $source 'packaging\plugin-admin\validate-package.ps1'), @'
param([string]$ZipPath, [string]$Architecture)
[System.IO.File]::WriteAllText("$ZipPath.validation.json", "$Architecture|$ZipPath")
'@)
    foreach ($architecture in @('x64', 'x86')) {
        [System.IO.File]::WriteAllText((Join-Path $source "NotepadViewerPlus-0.3.0-$architecture.zip"), 'unchanged package bytes')
        [System.IO.File]::WriteAllText((Join-Path $source "NotepadViewerPlus-0.3.0-$architecture.zip.validation.json"), 'stale report')
    }
    return $source
}

function Invoke-Helper {
    param([string]$Source, [bool]$WhatIf = $false)
    # Windows PowerShell -File cannot pass a false switch value reliably.
    $scriptPath = (Join-Path $Source 'Rename-ProjectFolder.ps1').Replace("'", "''")
    $command = "& '$scriptPath' -Confirm:`$false"
    if ($WhatIf) { $command += ' -WhatIf' }
    $arguments = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', $command)
    # Capture expected failure diagnostics without making the test shell stop early.
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $powerShell @arguments 2>&1 | Out-String
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $oldPreference
    }
    return @{ Code = $code; Output = $output }
}

try {
    $source = New-Fixture 'what-if'
    $result = Invoke-Helper $source $true
    Assert-True ($result.Code -eq 0) "WhatIf failed: $($result.Output)"
    Assert-True (Test-Path -LiteralPath (Join-Path $source 'build\CMakeCache.txt')) 'WhatIf deleted a cache'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path (Split-Path -Parent $source) 'notepad-viewer-plus'))) 'WhatIf moved the folder'
    Assert-True ((Get-Content -LiteralPath (Join-Path $source 'NotepadViewerPlus-0.3.0-x64.zip.validation.json') -Raw) -eq 'stale report') 'WhatIf changed a report'

    $source = New-Fixture 'collision'
    New-Item -ItemType Directory -Path (Join-Path (Split-Path -Parent $source) 'notepad-viewer-plus') | Out-Null
    $result = Invoke-Helper $source
    Assert-True ($result.Code -ne 0) 'Existing destination was not rejected'
    Assert-True (Test-Path -LiteralPath (Join-Path $source 'build\CMakeCache.txt')) 'Collision removed original files'

    $source = New-Fixture 'unverified-build'
    Remove-Item -LiteralPath (Join-Path $source 'build\CMakeCache.txt')
    $result = Invoke-Helper $source
    Assert-True ($result.Code -ne 0) 'Unverified build directory was not rejected'
    Assert-True (Test-Path -LiteralPath (Join-Path $source 'build\generated.obj')) 'Unverified directory was deleted'

    $source = New-Fixture 'foreign-build'
    [System.IO.File]::WriteAllText((Join-Path $source 'build\CMakeCache.txt'), "CMAKE_HOME_DIRECTORY:INTERNAL=$temporary`r`n")
    $result = Invoke-Helper $source
    Assert-True ($result.Code -ne 0) 'Foreign build cache was not rejected'
    Assert-True (Test-Path -LiteralPath $source) 'Foreign build check moved the folder'

    $source = New-Fixture 'linked-worktree'
    Remove-Item -LiteralPath (Join-Path $source '.git') -Recurse -Force
    [System.IO.File]::WriteAllText((Join-Path $source '.git'), 'gitdir: elsewhere')
    $result = Invoke-Helper $source
    Assert-True ($result.Code -ne 0) 'Linked worktree was not rejected'
    Assert-True (Test-Path -LiteralPath $source) 'Linked worktree check moved the folder'

    $source = New-Fixture 'main-worktree-host'
    New-Item -ItemType Directory -Path (Join-Path $source '.git\worktrees\linked-checkout') -Force | Out-Null
    $result = Invoke-Helper $source
    Assert-True ($result.Code -ne 0) 'Main checkout hosting linked worktrees was not rejected'
    Assert-True (Test-Path -LiteralPath $source) 'Main worktree check moved the folder'

    $source = New-Fixture 'success'
    $result = Invoke-Helper $source
    Assert-True ($result.Code -eq 0) "Rename failed: $($result.Output)"
    $destination = Join-Path (Split-Path -Parent $source) 'notepad-viewer-plus'
    Assert-True (-not (Test-Path -LiteralPath $source)) 'Original folder still exists'
    foreach ($file in @('source.txt', '.git\history-marker', 'renderer\node_modules\dependency-marker')) {
        Assert-True ((Get-Content -LiteralPath (Join-Path $destination $file) -Raw) -eq 'preserve me') "Changed preserved file: $file"
    }
    foreach ($name in @('build', 'build-x86')) {
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $destination $name))) "Stale build remains: $name"
    }
    foreach ($architecture in @('x64', 'x86')) {
        $zip = Join-Path $destination "NotepadViewerPlus-0.3.0-$architecture.zip"
        Assert-True ((Get-Content -LiteralPath $zip -Raw) -eq 'unchanged package bytes') 'Package bytes changed'
        Assert-True ((Get-Content -LiteralPath "$zip.validation.json" -Raw) -eq "$architecture|$zip") 'Validator did not receive the new ZIP path'
    }
    $result = Invoke-Helper $destination
    Assert-True ($result.Code -eq 0) "Already-renamed retry failed: $($result.Output)"
    Write-Host 'Passed: WhatIf, collision, unverified/foreign builds, linked/main worktrees, rename/preservation/report refresh, and retry.'
} finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
}
