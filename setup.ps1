param([switch]$SkipTests)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Install Node.js 22.12+ or 24 LTS from https://nodejs.org, reopen PowerShell, and rerun setup.ps1.'
}
& node -e "const [a,b]=process.versions.node.split('.').map(Number);if(a<22||(a===22&&b<12))process.exit(1)"
if ($LASTEXITCODE -ne 0) { throw 'Node.js 22.12+ is required.' }
$compilerPath = Join-Path $PSScriptRoot '.tools\zig-windows-x86_64-0.13.0\zig.exe'
if (-not (Test-Path -LiteralPath $compilerPath) -and -not $env:CXX) {
    New-Item -ItemType Directory -Force '.tools' | Out-Null
    $archivePath = Join-Path $PSScriptRoot '.tools\zig-toolchain.zip'
    Write-Host 'Downloading the project-local Zig C++ compiler (about 80 MB)...'
    Invoke-WebRequest -Uri 'https://ziglang.org/download/0.13.0/zig-windows-x86_64-0.13.0.zip' -OutFile $archivePath
    $expectedHash = 'D859994725EF9402381E557C60BB57497215682E355204D754EE3DF75EE3C158'
    if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Compiler archive checksum mismatch.' }
    Expand-Archive -LiteralPath $archivePath -DestinationPath '.tools' -Force
}
& npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
& node scripts/build-core.mjs
if ($LASTEXITCODE -ne 0) { throw 'C++ compilation failed.' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
if (-not $SkipTests) {
    & npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw 'Automated tests failed.' }
}
Write-Host 'WARCOM is ready. Run .\run.ps1 to open it.'
