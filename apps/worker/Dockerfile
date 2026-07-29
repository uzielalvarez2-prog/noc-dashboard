FROM node:20-alpine

WORKDIR /app

# ping (ICMP) para el monitoreo de IP — no viene preinstalado en node:20-alpine
RUN apk add --no-cache iputils

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

# Copy workspace manifests (desde la raiz del repo)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY apps/web/prisma apps/web/prisma/

# Install all workspace dependencies
RUN pnpm install --no-frozen-lockfile

# Copy worker source
COPY apps/worker/src apps/worker/src/
COPY apps/worker/tsconfig.json apps/worker/

# Generate Prisma client (prisma binary esta en apps/web/node_modules/.bin)
RUN cd apps/web && node_modules/.bin/prisma generate

# Compile TypeScript (forma canonica en pnpm workspaces)
RUN pnpm --filter worker run build

WORKDIR /app/apps/worker

CMD ["node", "dist/index.js"]