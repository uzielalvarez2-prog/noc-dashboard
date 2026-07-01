# Handoff — WhatsApp EDC (retomar 2026-07-01 en PC trabajo)

> Estado: **~95% LISTO**. Código implementado, commiteado (`master`) y **desplegado en Vercel**.
> Falta **1 sola cosa**: poner la `INTERNAL_API_KEY` real (la de producción) en el `.env` del listener.

## El único pendiente (por qué se paró)

El listener ya postea a producción, pero Vercel responde **401 No autorizado** porque la
`INTERNAL_API_KEY` del listener (la **local** de la PC de casa) **no es la misma** que la de Vercel.

- En Vercel la variable `INTERNAL_API_KEY` es **"Sensitive"** → **no se puede ver ni copiar** desde el panel.
- La llave **real en texto plano** está en la **PC del trabajo**: `apps\hpsm-scraper\.env` → `INTERNAL_API_KEY=...`
  (es la misma que ya usa el scraper para postear a prod).

## Para TERMINAR mañana (elige dónde corre el listener)

### Opción A — listener en la PC del TRABAJO (recomendada, para dejarlo always-on junto al scraper)
1. `git pull --ff-only` (ya está todo en `master`, incluido este handoff).
2. `cd apps\wa-listener` → `copy .env.example .env` y llena:
   - `DASHBOARD_URL=https://noc-dashboard-iota.vercel.app`
   - `INTERNAL_API_KEY=` → **la misma que `apps\hpsm-scraper\.env`** (esa PC ya la tiene)
   - `WA_GROUP_NAME=STAFF SUPERVISIÓN`
3. `pnpm install` (baja whatsapp-web.js; usa el Chrome del sistema, no descarga Chromium si Chrome está instalado).
4. `pnpm start` → escanea el **QR** con el WhatsApp del **número de empresa** (Ajustes → Dispositivos vinculados). Hace backfill de 50.
5. **Task Scheduler → "al iniciar sesión"** que corra `pnpm start` en `apps\wa-listener` (igual que el scraper) para que quede siempre encendido.

### Opción B — terminar en la PC de CASA (`C:\Users\Uziel`)
Aquí ya está TODO listo (deps instaladas, QR vinculado, `.env` apuntando a prod). Solo falta la llave:
1. Trae la `INTERNAL_API_KEY` real del scraper del trabajo.
2. `notepad C:\Users\Uziel\noc-dashboard\apps\wa-listener\.env` → reemplaza la línea `INTERNAL_API_KEY=` con la real. Guarda.
3. `cd C:\Users\Uziel\noc-dashboard\apps\wa-listener` → `pnpm start`.
4. Deben salir `POST ... 200` y `Reporte enviado al dashboard` (ya no el 401).

### Verificar (cualquier opción)
Abre **https://noc-dashboard-iota.vercel.app** → **Incidentes → Abiertos → EDC → Reportes WhatsApp**.
Deben aparecer los reportes del grupo cuyo IM siga abierto.

## Lo que YA quedó hecho (no repetir)

- **git**: commit `7f21605` en `master` + push. Vercel desplegó (GET `/api/edc-reports` → 401 = ruta viva).
- **DB Neon (compartida con prod)**: tabla `EdcReport` creada con `prisma db push`. **No hace falta migrar otra vez.**
- **Probado en vivo**: 19 reportes reales del grupo entraron (vía localhost); el cross-ref ocultó 7 ya resueltos. La lógica funciona.
- **Archivos**: `apps/wa-listener/*` (app nueva), `apps/web/src/app/api/edc-reports/route.ts`,
  `components/open/EdcTabs.tsx`, `EdcWhatsappView.tsx`, `lib/queries/edcReports.ts`,
  `prisma/schema.prisma` (modelo `EdcReport`), `OpenIncidentsView.tsx` (ahora usa `EdcTabs`).

## Notas técnicas

- `pnpm groups` (en `apps/wa-listener`) lista los nombres EXACTOS de tus grupos, por si `WA_GROUP_NAME` no matchea.
- whatsapp-web.js se importa como default (es CommonJS) y usa el **Chrome del sistema** (`CHROME_PATH` opcional en `.env`).
- Regla del feature: solo se muestran los IM que sigan en `OpenIncident` (sin histórico); los resueltos desaparecen solos.
- La sesión de WhatsApp vive en `apps/wa-listener/.wwebjs_auth` (gitignored, NO versionar).
- En la PC de casa `pnpm` no venía en el PATH; se instaló con `npm i -g pnpm@10.28.0`.
- URL de prod: `https://noc-dashboard-iota.vercel.app`. Repo: `uzielalvarez2-prog/noc-dashboard`.
