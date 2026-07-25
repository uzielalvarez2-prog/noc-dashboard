# Listener de WhatsApp en la nube (Railway) — reemplaza la tarea NOC-WaListener
# de la PC trabajo. Con esto la PC queda 100% libre.
# whatsapp-web.js usa puppeteer (Chromium): Debian (bookworm), NO alpine.
FROM node:20-bookworm

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

# Chromium del SO + librerías que necesita para correr headless en un contenedor.
# Instalar el Chromium de Debian es más estable en la nube que dejar que puppeteer
# descargue el suyo; se apunta CHROME_PATH a este binario (más abajo).
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      libnss3 \
      libatk-bridge2.0-0 \
      libgtk-3-0 \
      libx11-xcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      libgbm1 \
      libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Manifests del workspace (contexto de build = raíz del repo).
# Solo se copia el package.json del listener: el glob apps/* de pnpm-workspace
# solo ve los directorios que existen en la imagen (mismo patrón que el scraper).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/wa-listener/package.json apps/wa-listener/

# PUPPETEER_SKIP_DOWNLOAD: no descargar el Chromium de puppeteer, usamos el del SO.
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN pnpm install --no-frozen-lockfile

COPY apps/wa-listener/src apps/wa-listener/src/
COPY apps/wa-listener/tsconfig.json apps/wa-listener/

# Chromium del SO (instalado arriba). whatsapp-web.js usa puppeteer-core, que no
# auto-detecta browser: el código lee CHROME_PATH y lo usa si existe.
ENV CHROME_PATH=/usr/bin/chromium
# La sesión de WhatsApp vive en un VOLUMEN persistente montado aquí en Railway.
ENV WA_SESSION_DIR=/data/.wwebjs_auth

WORKDIR /app/apps/wa-listener

# Puerto del servidor HTTP de envío (dashboard → WhatsApp). Railway inyecta PORT
# en runtime y enruta el dominio público a él; EXPOSE es documentativo.
EXPOSE 8080

CMD ["node_modules/.bin/tsx", "src/index.ts"]
