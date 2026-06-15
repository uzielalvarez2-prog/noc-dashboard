#Requires -Version 5.1
# Uso: .\run-closed-manual.ps1 -EndTime "11:30"
# Si no pasas -EndTime, usa la hora actual.
param(
    [string]$EndTime = (Get-Date -Format "HH:mm")
)

$ErrorActionPreference = "Stop"

$logDir     = "C:\Users\Admin\noc-csvs\logs"
$lockFile   = "C:\Users\Admin\noc-csvs\hpsm.lock"
$nodeExe    = "C:\Users\Admin\AppData\Local\Programs\nodejs\node.exe"
$tsxCli     = "C:\Users\Admin\noc-dashboard\apps\hpsm-scraper\node_modules\tsx\dist\cli.mjs"
$scraperDir = "C:\Users\Admin\noc-dashboard\apps\hpsm-scraper"

if (!(Test-Path $logDir)) { New-Item -ItemType Directory $logDir -Force | Out-Null }
Start-Transcript -Path "$logDir\run-closed-manual-$(Get-Date -Format 'yyyyMMdd-HHmm').log" -Append

# Lock anti-traslape
$lockedPid = 0
try { $lockedPid = [int](Get-Content $lockFile -Raw -ErrorAction Stop).Trim() } catch {}
if ($lockedPid -gt 0 -and (Get-Process -Id $lockedPid -ErrorAction SilentlyContinue)) {
    Write-Host "$(Get-Date -Format 'HH:mm:ss') [run-closed-manual] HPSM ocupado (PID $lockedPid) - espera y reintenta"
    Stop-Transcript; exit 1
}
Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
$PID | Out-File $lockFile -Encoding utf8 -NoNewline

$exitCode = 0
try {
    $env:HPSM_CLOSED_END_TIME = $EndTime
    Set-Location $scraperDir
    Write-Host "$(Get-Date -Format 'HH:mm:ss') [run-closed-manual] iniciando (rango 07:00-$EndTime)..."
    & $nodeExe $tsxCli src/run-closed.ts
    $exitCode = $LASTEXITCODE
} finally {
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
    Stop-Transcript
}
exit $exitCode
