# Handoff — WhatsApp EDC (retomar en PC trabajo)

> Última actualización: 2026-07-01 (noche, desde PC casa).
> El **dashboard** está 100% terminado y **desplegado en Vercel**. Lo único que
> falta es dejar el **listener** (apps/wa-listener) corriendo contra producción,
> y eso solo se puede en la PC del trabajo porque ahí está la llave real.

## Lo ÚNICO pendiente: listener → producción (en la PC del trabajo)

El listener manda los reportes del grupo de WhatsApp al dashboard. Ya funciona
(probado en casa contra localhost). Falta apuntarlo a Vercel con la llave correcta.

En Vercel la variable `INTERNAL_API_KEY` es "Sensitive" → NO se puede ver/copiar.
La llave real en texto plano está en la **PC del trabajo**: `apps\hpsm-scraper\.env`
→ `INTERNAL_API_KEY=...` (la misma que ya usa el scraper para postear a prod).

### Pasos (en la PC del trabajo)
1. `git pull --ff-only` (todo está en master).
2. `cd apps\wa-listener` → `copy .env.example .env` y llena:
   - `DASHBOARD_URL=https://noc-dashboard-iota.vercel.app`
   - `INTERNAL_API_KEY=` → **la misma de `apps\hpsm-scraper\.env`**
   - `WA_GROUP_NAME=STAFF SUPERVISIÓN`
3. `pnpm install` (baja whatsapp-web.js; usa el Chrome del sistema, no descarga Chromium).
   - Si `pnpm` no está: `npm i -g pnpm@10.28.0`.
4. `pnpm start` → escanea el QR con el WhatsApp del número de empresa
   (Ajustes → Dispositivos vinculados). Hace backfill de 50.
   - Debe salir `POST ... 200` y `Reporte enviado al dashboard` (si sale 401, la llave no coincide).
5. Dejarlo always-on: `apps\wa-listener\scripts\setup-listener-task.ps1` crea la tarea de
   Task Scheduler "al iniciar sesión" (igual que el scraper).
6. Verificar en https://noc-dashboard-iota.vercel.app → Incidentes → EDC → Reportes WhatsApp.

> Alternativa: dejar el listener en la PC de casa (ya tiene deps + QR vinculado + `.env`
> apuntando a prod). Solo faltaría pegar la llave real en `apps\wa-listener\.env` y `pnpm start`.

## Lo que YA está hecho y desplegado (no repetir)

Todo en `master` + Vercel. Feature de WhatsApp EDC + mejoras de UI:

- **Reportes WhatsApp en EDC**: modelo `EdcReport`, API `/api/edc-reports` (POST/GET/DELETE),
  cross-ref con abiertos (solo muestra IM abiertos, sin histórico), tarjetas con formato tal cual,
  copiar, nota editable, dismiss. Excluye CARE. Listener con backfill + captura de ediciones.
- **EDC → sub-tabs**: "Reportes WhatsApp" y "Total EDC" (antes "Escalados").
- **EDC → Total EDC**: tarjeta del total clicable (muestra todos los estatus); colores NEÓN por
  estatus en tarjetas Y en la pastilla de la tabla: Vendor rojo, Resolved verde, Work in progress
  ámbar, resto azul. (Solo EDC; WSP/CM sin cambios.)
- **PEXA/CECOR → Incidentes abiertos**: la tarjeta del total abre la tabla completa con buscador
  por todos los encabezados; los botones Reciente/Antiguo ordenan la TABLA además del Excel
  (server-side, respeta paginación). Se quitó el buscador global de arriba y el contador
  "Próxima actualización".

## Notas técnicas

- URL prod: `https://noc-dashboard-iota.vercel.app`. Repo: `uzielalvarez2-prog/noc-dashboard`.
- DB Neon (compartida con prod): tabla `EdcReport` ya creada con `prisma db push`. No re-migrar.
- `pnpm groups` (en apps/wa-listener) lista los nombres EXACTOS de grupos si `WA_GROUP_NAME` no matchea.
- whatsapp-web.js se importa como default (CommonJS) y usa el Chrome del sistema (`CHROME_PATH` opcional).
- La sesión de WhatsApp vive en `apps/wa-listener/.wwebjs_auth` (gitignored, NO versionar).
- Deploy = push a `master` (Vercel corre `prisma generate && next build` solo).
