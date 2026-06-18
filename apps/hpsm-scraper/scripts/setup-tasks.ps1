#Requires -Version 5.1
# Registra las 3 tareas programadas del scraper NOC.
# NOC-RunOpen usa XML (único modo de configurar Daily + repetición en PS 5.1).
# NOC-RunClosed-* usan schtasks directamente (trigger simple diario).
# Ejecutar una vez como Admin ELEVADO (clic derecho > Ejecutar como administrador):
# cambiar el LogonType a S4U requiere elevación.
#
# Todas corren con LogonType=S4U (sesión 0, sin ventana en el escritorio: no
# parpadean ni roban el foco) y prioridad 8 (below-normal: ceden CPU mientras
# el usuario trabaja). El scraper es headless (HEADED=false), así que no
# necesita sesión interactiva.

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
# 2. NOC-RunClosed-15 — diario a las 14:00
# -------------------------------------------------------
$out = schtasks /Create /TN "NOC-RunClosed-15" /TR "$ps $flg $dir\run-closed-15.ps1" `
    /SC DAILY /ST 14:00 /F 2>&1
if ($LASTEXITCODE -eq 0) { Write-Host "OK   NOC-RunClosed-15 (diario 14:00)" }
else                      { Write-Host "ERR  NOC-RunClosed-15: $out" }

# -------------------------------------------------------
# 3. NOC-RunClosed-2210 — diario a las 22:10
#    (antes 22:30; se elimina el nombre viejo si quedó registrado para
#     evitar que cerrados corra dos veces tras el renombre)
# -------------------------------------------------------
if (Get-ScheduledTask -TaskName "NOC-RunClosed-2230" -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName "NOC-RunClosed-2230" -Confirm:$false
    Write-Host "OK   eliminada tarea vieja NOC-RunClosed-2230 (renombrada a 2210)"
}
$out = schtasks /Create /TN "NOC-RunClosed-2210" /TR "$ps $flg $dir\run-closed-2230.ps1" `
    /SC DAILY /ST 22:10 /F 2>&1
if ($LASTEXITCODE -eq 0) { Write-Host "OK   NOC-RunClosed-2210 (diario 22:10)" }
else                      { Write-Host "ERR  NOC-RunClosed-2210: $out" }

# -------------------------------------------------------
# 4. Ajustes de las tareas de cerrados:
#    - S4U: corren en sesión 0, sin ventana en el escritorio.
#    - Prioridad 8 (below-normal): ceden CPU mientras el usuario trabaja.
#    - WakeToRun: despertar la PC si está dormida a la hora del trigger.
#    - Batería: no bloquear ni detener por batería.
#    (schtasks crea las tareas como Interactive; esto se aplica después.)
#    NOC-RunOpen ya lleva S4U + prioridad 8 en su XML, y NO lleva WakeToRun:
#    despertaría la PC cada 5 min.
# -------------------------------------------------------
$principal = New-ScheduledTaskPrincipal -UserId "Admin" -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -WakeToRun -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$settings.Priority = 8
foreach ($t in "NOC-RunClosed-15", "NOC-RunClosed-2210") {
    Set-ScheduledTask -TaskName $t -Principal $principal -Settings $settings | Out-Null
    Write-Host "OK   $t (S4U + prioridad 8 + WakeToRun + bateria)"
}

Write-Host ""
Write-Host "Verificar con:"
Write-Host "  schtasks /Query /TN NOC-RunOpen /V /FO LIST"
Write-Host "  schtasks /Query /TN NOC-RunClosed-15 /V /FO LIST"
Write-Host "  schtasks /Query /TN NOC-RunClosed-2210 /V /FO LIST"
