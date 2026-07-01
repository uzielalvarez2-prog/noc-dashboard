#Requires -Version 5.1
# Registra la tarea always-on del listener de WhatsApp (NOC-WaListener).
#
# El listener es un proceso PERSISTENTE (no una corrida periodica), asi que:
#   - Trigger: al iniciar sesion del usuario Admin (AtLogOn).
#   - LogonType Interactive + RunLevel Limited -> NO requiere elevacion para
#     registrarse, y corre en la sesion del usuario (Chrome headless de
#     whatsapp-web.js funciona sin problema ahi).
#   - ExecutionTimeLimit = 0 (PT0S) -> SIN limite de tiempo; si no, Task
#     Scheduler mataria el proceso a la hora.
#   - MultipleInstances = IgnoreNew -> nunca dos copias a la vez.
#   - Restart 3x cada 1 min si el proceso termina con error.
#
# La sesion de WhatsApp ya quedo guardada en apps/wa-listener/.wwebjs_auth, asi
# que NO vuelve a pedir QR. Es CRITICO que el WorkingDirectory sea la carpeta del
# listener porque LocalAuth usa la ruta relativa "./.wwebjs_auth".

$ErrorActionPreference = "Stop"

$appDir   = "C:\Users\Admin\noc-dashboard\apps\wa-listener"
$pnpmCmd  = "C:\Users\Admin\AppData\Local\Programs\nodejs\pnpm.cmd"
$psExe    = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$logDir   = "C:\Users\Admin\noc-csvs\logs"
$logFile  = "$logDir\wa-listener.log"
$taskName = "NOC-WaListener"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Comando: entra a la carpeta, corre `pnpm start` y vuelca stdout+stderr al log.
$inner = "Set-Location '$appDir'; & '$pnpmCmd' start *>> '$logFile'"
$argument = "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$inner`""

$action = New-ScheduledTaskAction -Execute $psExe -Argument $argument -WorkingDirectory $appDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "Admin"
$principal = New-ScheduledTaskPrincipal -UserId "Admin" -LogonType Interactive -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
$settings.Priority = 6

# Reemplaza si ya existia
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "OK   tarea previa $taskName eliminada (se recrea)"
}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings `
    -Description "Listener WhatsApp (STAFF SUPERVISION) -> POST /api/edc-reports. Always-on al iniciar sesion." | Out-Null

Write-Host "OK   $taskName registrada (al iniciar sesion, sin limite de tiempo)."
Write-Host "     Log: $logFile"
Write-Host ""
Write-Host "Verificar:  schtasks /Query /TN $taskName /V /FO LIST"
Write-Host "Arrancar ya: Start-ScheduledTask -TaskName $taskName"
