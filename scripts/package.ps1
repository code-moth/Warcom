param(
    [string]$OutputDirectory = 'releases',
    [string]$NodePath = ''
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not $NodePath) { $NodePath = (Get-Command node -ErrorAction Stop).Source }
$NodePath = (Resolve-Path -LiteralPath $NodePath).Path
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot $OutputDirectory))
if (-not $releaseRoot.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'OutputDirectory must be inside this project.'
}
New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
$sourceRoot = Join-Path $releaseRoot 'WARCOM-source-master'
$runtimeRoot = Join-Path $releaseRoot 'WARCOM-runtime-win-x64'
foreach ($target in @($sourceRoot, $runtimeRoot)) {
    if (Test-Path -LiteralPath $target) { throw "Output already exists: $target. Choose a fresh OutputDirectory." }
    New-Item -ItemType Directory -Path $target | Out-Null
}
foreach ($required in @('build\warcom-engine.exe','dist\index.html','licenses\Node-LICENSE.txt')) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing $required. Build the project before packaging." }
}

# Explicit allow-list: never package personal battles, compiler caches or development dependencies.
$sourceDirectories = @('backend','core','frontend','legacy','licenses','scripts','tests')
$sourceFiles = @('.gitignore','CMakeLists.txt','index.html','legacy-provenance.json','LICENSE','MIGRATION_PLAN.md','package-lock.json','package.json','README.md','run.ps1','setup.ps1','tsconfig.json','VALIDATION.md','vite.config.js')
foreach ($name in $sourceDirectories + $sourceFiles) { Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $sourceRoot -Recurse }
New-Item -ItemType Directory -Path (Join-Path $sourceRoot 'data') | Out-Null
Copy-Item -LiteralPath 'data\.gitkeep' -Destination (Join-Path $sourceRoot 'data\.gitkeep')
@'
# Source package

This folder contains the complete source and a Git repository with its master branch checked out.
The packaging commit is a new local snapshot of this migration, not the upstream Git history.
No remote is configured and no files have been pushed anywhere.

    git status
    git log --oneline
    .\setup.ps1
    .\run.ps1

The original source is preserved under legacy/. The tests verify its recorded hashes.
The .git/info/attributes file disables text conversion for this packaged repository so those
original bytes stay unchanged. Keep that rule when committing from this extracted repository.
The compiler, dependencies, generated executables, and personal battle data are excluded.
The setup script obtains the required compiler/dependencies and rebuilds the application.
'@ | Set-Content -LiteralPath (Join-Path $sourceRoot 'SOURCE_PACKAGE.md') -Encoding UTF8

& git init --initial-branch=master $sourceRoot
if ($LASTEXITCODE -ne 0) { throw 'Could not initialize source repository.' }
& git -C $sourceRoot config core.autocrlf false
& git -C $sourceRoot config user.name 'WARCOM Source Package'
& git -C $sourceRoot config user.email 'package@warcom.local'
& git -C $sourceRoot config commit.gpgsign false
# Git's nested legacy/.gitattributes must not normalize the original archived bytes.
'* -text' | Set-Content -LiteralPath (Join-Path $sourceRoot '.git\info\attributes') -Encoding ASCII
& git -C $sourceRoot add --all
if ($LASTEXITCODE -ne 0) { throw 'Could not stage source.' }
& git -C $sourceRoot commit -m 'Package WARCOM local web migration'
if ($LASTEXITCODE -ne 0) { throw 'Could not commit source.' }
$commit = (& git -C $sourceRoot rev-parse HEAD).Trim()
& git -C $sourceRoot fsck --full
if ($LASTEXITCODE -ne 0) { throw 'Source Git repository failed integrity verification.' }

foreach ($directory in @('backend','dist','licenses')) { Copy-Item -LiteralPath $directory -Destination $runtimeRoot -Recurse }
foreach ($directory in @('runtime','build','core','data')) { New-Item -ItemType Directory -Path (Join-Path $runtimeRoot $directory) | Out-Null }
Copy-Item -LiteralPath $NodePath -Destination (Join-Path $runtimeRoot 'runtime\node.exe')
Copy-Item -LiteralPath 'build\warcom-engine.exe' -Destination (Join-Path $runtimeRoot 'build\warcom-engine.exe')
Copy-Item -LiteralPath 'core\weapons.dat' -Destination (Join-Path $runtimeRoot 'core\weapons.dat')
foreach ($file in @('run.ps1','LICENSE','README.md','MIGRATION_PLAN.md','VALIDATION.md')) { Copy-Item -LiteralPath $file -Destination $runtimeRoot }
'{"name":"warcom-portable","version":"3.0.0","private":true,"type":"module"}' | Set-Content -LiteralPath (Join-Path $runtimeRoot 'package.json') -Encoding ASCII
@'
@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
if errorlevel 1 pause
'@ | Set-Content -LiteralPath (Join-Path $runtimeRoot 'Start WARCOM.cmd') -Encoding ASCII
$nodeVersion = (& $NodePath --version).Trim()
@"
WARCOM — PORTABLE WINDOWS 11 x64 EDITION
========================================

1. Right-click the ZIP and choose Extract All. Do not run it inside the ZIP.
2. Open the extracted WARCOM-runtime-win-x64 folder.
3. Double-click Start WARCOM.cmd.
4. Your browser opens http://127.0.0.1:4173.

No installation, Node.js download, compiler, npm, account, or Internet access is needed.
The package includes Node.js $nodeVersion, the C++ engine, and the built browser interface.
Keep all folders together in a writable location, such as Documents\WARCOM.
Keep the command window open while playing. Press Ctrl+C to stop WARCOM.

If another WARCOM instance is running, close its command window or use a different port:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\run.ps1 -Port 4180

HOW TO USE
----------
Start with Load training engagement, or add units and assignments yourself.
Save changes before closing. Resolve individual assignments or a full round.
Files & settings provides snapshots, imports and exports. Battle log shows results and undo.
No personal campaign data is included. The initial workspace is empty.

BACKUPS
-------
Your battles are stored in data\ beside this file. Back up that whole folder.
To upgrade, stop WARCOM and copy your data folder into the new extracted package.
The error log is data\server.stderr.log. Keep the package out of read-only system folders.

DOCUMENTATION AND SOURCE
------------------------
README.md explains the rules, workflows, architecture and known differences.
Its setup/build instructions apply to the SOURCE package, not this prebuilt runtime.
VALIDATION.md records the completed tests. MIGRATION_PLAN.md records compatibility decisions.
The matching full source is supplied in WARCOM-source-master.zip, including .git on master.
Source commit: $commit

The original GPL-3.0 license is in LICENSE. Bundled component notices are in licenses\.
Whip is unavailable because its original weapon table is incomplete. Armor indexing is
corrected by default; Files & settings offers legacy compatibility. Historical DOS random
sequences are not reproduced. The application operates entirely locally.
"@ | Set-Content -LiteralPath (Join-Path $runtimeRoot 'START HERE.txt') -Encoding UTF8
@{ version='3.0.0'; platform='windows-x64'; node=$nodeVersion; sourceCommit=$commit; sourceArchive='WARCOM-source-master.zip' } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeRoot 'release.json') -Encoding UTF8

Add-Type -AssemblyName System.IO.Compression.FileSystem
foreach ($directory in @($sourceRoot,$runtimeRoot)) {
    $zip = $directory + '.zip'
    if (Test-Path -LiteralPath $zip) { throw "Archive already exists: $zip" }
    # Unlike Compress-Archive, ZipFile includes the hidden .git directory.
    [IO.Compression.ZipFile]::CreateFromDirectory($directory,$zip,[IO.Compression.CompressionLevel]::Optimal,$true)
}
Get-FileHash -Algorithm SHA256 -LiteralPath ($sourceRoot+'.zip'),($runtimeRoot+'.zip') |
    ForEach-Object { "$($_.Hash)  $([IO.Path]::GetFileName($_.Path))" } |
    Set-Content -LiteralPath (Join-Path $releaseRoot 'SHA256SUMS.txt') -Encoding ASCII
Write-Host "Runtime and source packages created in $releaseRoot"
