# RUNBOOK — Reparar sincronía del scraper HPSM (PC Admin)

> **Para Claude:** este documento es un plan ejecutable. Síguelo en orden, fase por fase.
> Reporta el resultado de cada fase antes de pasar a la siguiente. Creado el 2026-06-11
> en la sesión de diagnóstico desde la PC personal (contexto canónico:
> `C:\Users\Uziel\noc-dashboard`).

## Contexto del problema

El 11-jun-2026 se probó la sincronía en vivo desde la PC Admin y fallaron tres cosas:

1. **Abiertos dejaron de actualizar a las 16:01** — la tarea `NOC-RunOpen` corre cada
   8 min (06:00–23:00) pero el último snapshot en BD quedó de las 16:01 (456 incidentes).
2. **Los abiertos llegaron sin campos** — servicio, estado, distrito y asignado vacíos.
   El usuario observó que el scraper bajaba de **otro criterio/vista de HPSM**, no del
   correcto. "Top por Estado/Distrito" muestra "(sin dato)".
3. **Cerrados nunca suben automáticamente** — en 3 días la única carga de cerrados fue
   manual (`export (6).csv`, 9-jun 21:42). Las tareas de las 15:00 y 22:30 jamás han
   completado una carga.

## Diagnóstico previo (evidencia ya recolectada)

- El código en `master` **sí tiene el fix de columnas**: commit `2d6c367` (10-jun 17:47)
  agrega `setColumns()` con `OPEN_COLUMNS` (Incident ID, Open Time, Status, Assignment
  Group, Assignee, Company, Region, Divisional) en
  `apps/hpsm-scraper/src/download-open.ts`. También son posteriores los fixes de sesión:
  `7f3f101` (timeout 60s) y `2b57b0c` (login fresco + logout limpio).
- **Hipótesis principal:** la PC Admin tiene código anterior a esos commits (falta
  `git pull`). Eso explica los 3 síntomas a la vez: exporta la vista por defecto (sin
  campos), muere con sesión HPSM sucia (paro de las 16:01) y cerrados fallan.
- **Hipótesis secundaria (paro de las 16:01):** lock huérfano. Los wrappers PS1 usan
  `C:\Users\Admin\noc-csvs\hpsm.lock` con el PID; si el proceso murió sin limpiar y otro
  proceso vivo reutilizó ese PID, **todas las corridas se saltan en silencio** con el
  mensaje `HPSM ocupado (PID x) - saltado` en el log.
- **Bug de bitácora:** las cargas del scraper usan `userId: "scraper-bot"` que no existe
  en la tabla `User` → el AuditLog falla por llave foránea y un `.catch(() => {})` lo
  traga. Por eso no hay rastro de las corridas. Fix: `node scripts/create-scraper-bot.js`
  (en `apps/web`).

## Rutas en la PC Admin

| Qué | Dónde |
|---|---|
| Repo | `C:\Users\Admin\noc-dashboard` |
| CSVs descargados | `C:\Users\Admin\noc-csvs\open-incidents.csv` (y de cerrados) |
| Logs (transcripts diarios) | `C:\Users\Admin\noc-csvs\logs\run-open-AAAAMMDD.log`, `run-closed-15-*.log`, `run-closed-2230-*.log` |
| Lock anti-traslape | `C:\Users\Admin\noc-csvs\hpsm.lock` |
| Tareas programadas | `NOC-RunOpen` (cada 8 min, 06:00–23:00), `NOC-RunClosed-15` (15:00), `NOC-RunClosed-2230` (22:30) |
| Config del scraper | `apps\hpsm-scraper\.env` (HPSM_USER, HPSM_PASSWORD, INTERNAL_API_KEY, DASHBOARD_URL, DOWNLOAD_DIR) |
| Dashboard producción | https://noc-dashboard-iota.vercel.app |

## FASE 0 — Actualizar código (primero, siempre)

1. En `C:\Users\Admin\noc-dashboard`: `git log --oneline -1` y anotar el commit actual
   (esto confirma o descarta la hipótesis principal — **reportarlo**).
2. `git pull`. Verificar que el historial incluya `2d6c367`, `7f3f101`, `2b57b0c` y este
   runbook.
3. `pnpm install` en la raíz del repo.
4. Verificar que `apps\hpsm-scraper\.env` tenga: `HPSM_USER`, `HPSM_PASSWORD`,
   `INTERNAL_API_KEY` (igual al de Vercel), `DASHBOARD_URL=https://noc-dashboard-iota.vercel.app`
   y `DOWNLOAD_DIR=C:\Users\Admin\noc-csvs`. **No imprimir los valores secretos.**

## FASE 1 — Diagnóstico forense (solo lectura, no rompe nada)

5. Leer la primera línea de `C:\Users\Admin\noc-csvs\open-incidents.csv`: son los
   encabezados que HPSM exportó en la última corrida. Si NO incluyen
   `Assignee/Region/Divisional` → confirmada la vista equivocada.
6. Revisar `C:\Users\Admin\noc-csvs\logs\run-open-20260611.log` (y el del día actual):
   - Buscar `HPSM ocupado` → lock huérfano (ver paso 8).
   - Buscar el último error tras las 16:01 → causa real del paro.
7. Revisar los logs `run-closed-15-*.log` y `run-closed-2230-*.log`: ¿las tareas corren
   y fallan, o ni corren? Si no hay archivos de log, las tareas no se han disparado.
8. Si existe `C:\Users\Admin\noc-csvs\hpsm.lock`: ver el PID que contiene y qué proceso
   es (`Get-Process -Id <pid>`). Si no es node/el scraper → es lock huérfano por reúso
   de PID: **borrarlo**.
9. Estado de las 3 tareas:
   `schtasks /Query /TN NOC-RunOpen /V /FO LIST` (ídem `NOC-RunClosed-15` y
   `NOC-RunClosed-2230`) → anotar "Last Run Time" y "Last Result" (0 = ok).

## FASE 2 — Corrida manual verificada (abiertos)

10. Desde `apps\hpsm-scraper`, correr con navegador visible para observar:
    `$env:HEADED="true"; npm run run:open`
    Observar que haga: login fresco → Search Incidents → checkbox Open → **More →
    Modify Columns** (llena las 8 columnas) → Proceed → More → Export.
11. Verificar el CSV recién bajado: encabezados = las 8 columnas de `OPEN_COLUMNS`.
12. Verificar resultado en BD/dashboard:
    - Desde `apps\web`: `node scripts/check-data.js` → la muestra debe salir con
      estado/distrito/asignado **llenos** (servicio seguirá vacío — ver Pendientes).
    - En el dashboard: "Top por Estado" y "Top por Distrito" con datos reales.
    - Nota: `apps\web\.env.local` con `DATABASE_URL` puede no existir en la PC Admin;
      si falta, crearla (la cadena está en Vercel → Settings → Environment Variables).

## FASE 3 — Corrida manual verificada (cerrados)

13. Desde `apps\hpsm-scraper`: `$env:HEADED="true"; npm run run:closed`
    (usa rango 07:00–22:30 del día; los wrappers programados ajustan el rango).
    Capturar cualquier error completo.
14. Verificar con `node scripts/check-data.js` (desde `apps\web`) que la última carga de
    cerrados ya sea de hoy, y en el dashboard la vista de cerrados.

## FASE 4 — Bitácora y vigilancia

15. Desde `apps\web`: `node scripts/check-audit.js`. Si dice que `scraper-bot` no
    existe → `node scripts/create-scraper-bot.js` (idempotente; deja una cuenta sin
    login posible, solo para la llave foránea de la bitácora).
16. Dejar pasar un ciclo de 8 minutos y volver a correr `node scripts/check-audit.js`:
    debe aparecer un `IMPORT_OPEN_CSV | scraper` nuevo. Eso confirma que la tarea
    programada quedó viva de punta a punta.
17. Si alguna tarea quedó mal registrada (rutas viejas, "Last Result" ≠ 0 persistente):
    re-registrarlas como Admin con `apps\hpsm-scraper\scripts\setup-tasks.ps1`.

## Criterio de éxito (checklist final)

- [ ] CSV de abiertos con los 8 encabezados correctos.
- [ ] Dashboard: estado, distrito y asignado visibles; "Top por Estado/Distrito" con datos.
- [ ] Snapshot de abiertos renovándose cada 8 min sin intervención.
- [ ] Cerrados del día cargados (manual hoy; automático a las 15:00/22:30 en adelante).
- [ ] Bitácora registrando cargas del scraper (`scraper-bot`).
- [ ] `hpsm.lock` sin candados huérfanos.

## Pendientes de decisión (no bloquean)

- **Campo SERVICIO en abiertos:** el formulario "Modify Columns" de HPSM que llena el
  scraper tiene 8 espacios y los 8 están ocupados. Para llenar servicio habría que
  sacrificar una columna por `Service Uniqueid` (¿cuál?) o averiguar si el form admite
  más de 8. Decidir con el usuario viendo el form en vivo (paso 10 con HEADED).
- Mover el lock a verificación por nombre de proceso (no solo PID) para eliminar el
  modo de falla de PID reusado.
