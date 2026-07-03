# Scraper HPSM en la nube (Railway) — reemplaza las tareas de Windows
# NOC-RunOpen / NOC-RunClosed-15 / NOC-RunClosed-2210 de la PC trabajo.
# Playwright necesita glibc: Debian (bookworm), NO alpine.
FROM node:20-bookworm

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

# Manifests del workspace (contexto de build = raíz del repo).
# Solo se copia el package.json del scraper: el glob apps/* de pnpm-workspace
# solo ve los directorios que existen en la imagen (mismo patrón que el worker).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/hpsm-scraper/package.json apps/hpsm-scraper/

RUN pnpm install --no-frozen-lockfile

# Chromium + dependencias del SO, en la versión exacta que resolvió el lockfile
RUN cd apps/hpsm-scraper && node_modules/.bin/playwright install --with-deps chromium

COPY apps/hpsm-scraper/src apps/hpsm-scraper/src/
COPY apps/hpsm-scraper/tsconfig.json apps/hpsm-scraper/

# El CSV descargado es transitorio — directorio efímero del contenedor
ENV DOWNLOAD_DIR=/tmp/noc-csvs

WORKDIR /app/apps/hpsm-scraper

CMD ["node_modules/.bin/tsx", "src/scheduler.ts"]
