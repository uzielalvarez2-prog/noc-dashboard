FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

# Copy workspace manifests (desde la raíz del repo)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY apps/web/prisma apps/web/prisma/

# Install all workspace dependencies
RUN pnpm install --no-frozen-lockfile

# Copy worker source
COPY apps/worker/src apps/worker/src/
COPY apps/worker/tsconfig.json apps/worker/
COPY apps/worker/prisma.config.ts apps/worker/

# Generate Prisma client (schema vive en apps/web/prisma)
RUN node_modules/.bin/prisma generate --schema apps/web/prisma/schema.prisma

# Compile TypeScript
RUN cd apps/worker && pnpm build

WORKDIR /app/apps/worker

CMD ["node", "dist/index.js"]
