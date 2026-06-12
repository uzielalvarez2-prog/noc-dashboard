#Requires -Version 5.1
# Registra las 3 tareas programadas del scraper NOC.
# NOC-RunOpen usa XML (único modo de configurar Daily + repetición en PS 5.1).
# NOC-RunClosed-* usan schtasks directamente (trigger simple diario).
# Ejecutar una vez como Admin (usuario interactivo).

$dir = "C:\Users\Admin\noc-dashboard\apps\hpsm-scraper\scripts"
$ps  = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$flg = "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File"

# -------------------------------------------------------
# 1. NOC-RunOpen — diario, cada 8 min de 06:00 a 23:00
#    Requiere XML porque schtasks /SC MINUTE /ET no repite diariamente
# -------------------------------------------------------
$out = schtasks /Create /TN "NOC-RunOpen" /XML "$dir\NOC-RunOpen.xml" /F 2>&1
if ($LASTEXITCODE -eq 0) { Write-Host "OK   NOC-RunOpen (diario, cada 8 min, 06:00-23:00)" }
else                      { Write-Host "ERR  NOC-RunOpen: $out" }

# -------------------------------------------------------
# 2. NOC-RunClosed-15 — diario a las 15:00
# -------------------------------------------------------
$out = schtasks /Create /TN "NOC-RunClosed-15" /TR "$ps $flg $dir\run-closed-15.ps1" `
    /SC DAILY /ST 15:00 /F 2>&1
if ($LASTEXITCODE -eq 0) { Write-Host "OK   NOC-RunClosed-15 (diario 15:00)" }
else                      { Write-Host "ERR  NOC-RunClosed-15: $out" }

# -------------------------------------------------------
# 3. NOC-RunClosed-2230 — diario a las 22:30
# -------------------------------------------------------
$out = schtasks /Create /TN "NOC-RunClosed-2230" /TR "$ps $flg $dir\run-closed-2230.ps1" `
    /SC DAILY /ST 22:30 /F 2>&1
if ($LASTEXITCODE -eq 0) { Write-Host "OK   NOC-RunClosed-2230 (diario 22:30)" }
else                      { Write-Host "ERR  NOC-RunClosed-2230: $out" }

Write-Host ""
Write-Host "Verificar con:"
Write-Host "  schtasks /Query /TN NOC-RunOpen /V /FO LIST"
Write-Host "  schtasks /Query /TN NOC-RunClosed-15 /V /FO LIST"
Write-Host "  schtasks /Query /TN NOC-RunClosed-2230 /V /FO LIST"
