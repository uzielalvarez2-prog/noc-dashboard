#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$logDir     = "C:\Users\Admin\noc-csvs\logs"
$lockFile   = "C:\Users\Admin\noc-csvs\hpsm.lock"
$nodeExe    = "C:\Users\Admin\AppData\Local\Programs\nodejs\node.exe"
$tsxCli     = "C:\Users\Admin\noc-dashboard\apps\hpsm-scraper\node_modules\tsx\dist\cli.mjs"
$scraperDir = "C:\Users\Admin\noc-dashboard\apps\hpsm-scraper"

if (!(Test-Path $logDir)) { New-Item -ItemType Directory $logDir -Force | Out-Null }
Start-Transcript -Path "$logDir\run-closed-15-$(Get-Date -Format 'yyyyMMdd').log" -Append

# Lock anti-traslape: cerrados solo corre 2x/día y es importante, así que si
# HPSM está ocupado (run-open cada 5 min) ESPERA a que se libere en vez de
# rendirse. Los run-open son cortos. Aborta con error si no se libera en 5 min.
$lockWaitMax = 300  # segundos
$lockWaited  = 0
while ($true) {
    $lockedPid = 0
    try { $lockedPid = [int](Get-Content $lockFile -Raw -ErrorAction Stop).Trim() } catch {}
    if ($lockedPid -le 0 -or -not (Get-Process -Id $lockedPid -ErrorAction SilentlyContinue)) { break }
    if ($lockWaited -ge $lockWaitMax) {
        Write-Host "$(Get-Date -Format 'HH:mm:ss') [run-closed-15] HPSM ocupado (PID $lockedPid) tras ${lockWaitMax}s - abortado"
        Stop-Transcript; exit 1
    }
    Write-Host "$(Get-Date -Format 'HH:mm:ss') [run-closed-15] HPSM ocupado (PID $lockedPid) - esperando..."
    Start-Sleep -Seconds 10
    $lockWaited += 10
}
Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
$PID | Out-File $lockFile -Encoding utf8 -NoNewline

$exitCode = 0
try {
    $env:HPSM_CLOSED_END_TIME = "15:00"
    Set-Location $scraperDir
    Write-Host "$(Get-Date -Format 'HH:mm:ss') [run-closed-15] iniciando (rango 07:00-15:00)..."
    & $nodeExe $tsxCli src/run-closed.ts
    $exitCode = $LASTEXITCODE
} finally {
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
    Stop-Transcript
}
exit $exitCode
