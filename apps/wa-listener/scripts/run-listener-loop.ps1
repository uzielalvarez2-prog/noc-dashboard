#Requires -Version 5.1
# Supervisor del listener: relanza `pnpm start` indefinidamente si el proceso
# termina (crash o exit limpio).
#
# whatsapp-web.js tiene un bug intermitente y no resuelto (ProtocolError:
# Network.getResponseBody) que mata el proceso Node entero en reconexion.
# El RestartCount/RestartInterval de Task Scheduler resulto poco confiable
# con triggers AtLogOn+Interactive (no reintento tras el crash del 2026-07-03),
# asi que el reintento se maneja aqui adentro, dentro de la MISMA instancia
# de tarea, en vez de depender de que Task Scheduler relance la tarea.

$ErrorActionPreference = "Continue"

$appDir            = "C:\Users\Admin\noc-dashboard\apps\wa-listener"
$pnpmCmd           = "C:\Users\Admin\AppData\Local\Programs\nodejs\pnpm.cmd"
$logFile           = "C:\Users\Admin\noc-csvs\logs\wa-listener.log"
$retryDelaySeconds = 15

Set-Location $appDir

while ($true) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $logFile -Value "$ts [supervisor] Arrancando wa-listener"

    & $pnpmCmd start *>> $logFile
    $exitCode = $LASTEXITCODE

    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $logFile -Value "$ts [supervisor] wa-listener termino (exit $exitCode); reintentando en ${retryDelaySeconds}s..."
    Start-Sleep -Seconds $retryDelaySeconds
}
