# wa-listener

Escucha el grupo de WhatsApp **"STAFF SUPERVISIÓN"** y reenvía al dashboard los
reportes de incidentes críticos que traen un `IMxxxxxxx`. El dashboard los muestra
en la pestaña **EDC → Reportes WhatsApp** mientras el IM siga abierto.

Solo LEE mensajes (no envía nada). Vía `whatsapp-web.js` (dispositivo vinculado por
QR, como WhatsApp Web) — la API oficial de Meta no puede leer grupos existentes.

## Setup (una sola vez)

```bash
cd apps/wa-listener
cp .env.example .env      # llena INTERNAL_API_KEY (la misma del dashboard) y DASHBOARD_URL
pnpm install              # ⚠ descarga Chromium (~150 MB) vía Puppeteer
pnpm start                # imprime un QR en la consola
```

Escanea el QR con el WhatsApp del **número de empresa** (el que ya está en el grupo):
WhatsApp → Ajustes → **Dispositivos vinculados** → Vincular dispositivo. No desconecta
el celular (WhatsApp permite hasta 4 dispositivos vinculados).

La sesión queda guardada en `.wwebjs_auth/` (gitignored), así que no hay que
re-escanear en cada arranque.

## Operación

- `pnpm start` mantiene el proceso vivo escuchando. Al arrancar hace **backfill** de
  los últimos `WA_BACKFILL_LIMIT` (50) mensajes para recuperar lo perdido si la PC
  estuvo apagada.
- El match es solo por regex `IM[A-Z]{2,}\d+`. El bloque de texto se guarda tal cual.
- Para que sobreviva reinicios de sesión: Task Scheduler "al iniciar sesión" (no cron),
  o un host siempre encendido (Railway/VPS). Empezar con la PC local + backfill.

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `DASHBOARD_URL` | URL del dashboard (local o Vercel). |
| `INTERNAL_API_KEY` | Clave compartida con el API (`x-internal-key`). Nunca versionar. |
| `WA_GROUP_NAME` | Nombre exacto del grupo (default `STAFF SUPERVISIÓN`). |
| `WA_BACKFILL_LIMIT` | Mensajes a releer al arrancar (default `50`). |
