param([int]$Port = 4173, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path 'build\warcom-engine.exe') -or -not (Test-Path 'dist\index.html')) { throw 'Run .\setup.ps1 first.' }
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Choose a port between 1024 and 65535.' }
$env:PORT = "$Port"
$localUrl = "http://127.0.0.1:$Port"
Write-Host "Starting WARCOM at $localUrl. Press Ctrl+C to stop."
$bundledNode = Join-Path $PSScriptRoot 'runtime\node.exe'
$nodePath = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node -ErrorAction Stop).Source }
$stdoutPath = Join-Path $PSScriptRoot 'data\server.stdout.log'
$stderrPath = Join-Path $PSScriptRoot 'data\server.stderr.log'
New-Item -ItemType Directory -Force 'data' | Out-Null
$serverProcess = Start-Process -FilePath $nodePath -ArgumentList 'backend/server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
try {
    $ready = $false
    for ($attempt=0; $attempt -lt 50; $attempt++) {
        if ($serverProcess.HasExited) { throw "WARCOM failed to start. $(Get-Content -LiteralPath $stderrPath -Raw)" }
        try { $health = Invoke-RestMethod -Uri "$localUrl/api/health" -TimeoutSec 1; $ready = $health.ok -and $health.pid -eq $serverProcess.Id } catch { $ready = $false }
        if ($ready) { break }
        Start-Sleep -Milliseconds 200
    }
    if (-not $ready) { throw 'WARCOM did not become ready. Check data/server.stderr.log.' }
    if (-not $NoBrowser) { Start-Process $localUrl }
    Write-Host 'WARCOM is running. Keep this PowerShell window open.'
    while (-not $serverProcess.HasExited) { Start-Sleep -Milliseconds 500 }
} finally {
    if (-not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id }
}
