# Scraper HPSM en la nube (Railway) — reemplaza las tareas de Windows
# NOC-RunOpen / NOC-RunClosed-15 / NOC-RunClosed-2210 de la PC trabajo.
# Playwright necesita glibc: Debian (bookworm), NO alpine.
FROM node:20-bookworm

WORKDIR /app

# tini como PID 1: recoge procesos zombie/huérfanos (Chromium vía Playwright)
# y reenvía señales correctamente. Sin esto, un timeout mata al script pero
# los subprocesos de Chromium pueden quedar huérfanos acumulando memoria/PIDs
# hasta agotar el contenedor (síntoma: "spawn ... EAGAIN").
RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10 --activate

# Manifests del workspace (contexto de build = raíz del repo).
# Solo se copia el package.json del scraper: el glob apps/* de pnpm-workspace
# solo ve los directorios que existen en la imagen (mismo patrón que el worker).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/hpsm-scraper/package.json apps/hpsm-scraper/
# patches/ es OBLIGATORIO aunque el scraper no use whatsapp-web.js: el
# pnpm-workspace.yaml que se copia arriba declara el patch, y `pnpm install`
# aborta si el .patch no está en el contexto de build.
COPY patches patches/

RUN pnpm install --no-frozen-lockfile

# Chromium + dependencias del SO, en la versión exacta que resolvió el lockfile
RUN cd apps/hpsm-scraper && node_modules/.bin/playwright install --with-deps chromium

COPY apps/hpsm-scraper/src apps/hpsm-scraper/src/
COPY apps/hpsm-scraper/tsconfig.json apps/hpsm-scraper/

# El CSV descargado es transitorio — directorio efímero del contenedor
ENV DOWNLOAD_DIR=/tmp/noc-csvs

WORKDIR /app/apps/hpsm-scraper

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node_modules/.bin/tsx", "src/scheduler.ts"]
