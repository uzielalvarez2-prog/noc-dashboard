# NOC Dashboard

Dashboard interno de operaciones de red para equipo NOC (~45 ingenieros). Extrae incidentes y métricas desde HP Service Manager, los normaliza en Postgres, y los presenta en tiempo casi-real con alertas automáticas por email ante riesgos de SLA.

## Commands

- `pnpm dev` — Inicia Next.js en localhost:3000 (desde raíz del monorepo)
- `pnpm web:dev` — Inicia solo la app web
- `pnpm build` — Build de producción (turbo)
- `pnpm lint` — ESLint + TypeScript check
- `pnpm test` — Vitest unit tests
- `cd apps/web && pnpm prisma db push` — Sincroniza schema con DB
- `cd apps/web && pnpm prisma generate` — Regenera tipos Prisma
- `cd apps/web && pnpm prisma studio` — UI para inspeccionar DB
- `cd apps/worker && pnpm dev` — Inicia worker de sync HPSM

## Tech Stack

Next.js 15 App Router + TypeScript strict + Tailwind CSS v4 + shadcn/ui + Tremor + TanStack Table v8 + TanStack Query + NextAuth v5 + Prisma + PostgreSQL (Neon) + Redis (Upstash) + Recharts + Resend + Node.js Worker + Turbo monorepo

## Architecture

### Data Flow

HPSM DB → [Worker (Railway, cada 10s)] → Postgres/Neon → [Next.js API Routes] → [Browser polling TanStack Query, cada 10s] → Dashboard

El browser NUNCA conecta directo a HPSM ni a Postgres. Todo pasa por las API routes de Next.js.
Las notificaciones de alerta las dispara el **worker**, no el frontend.

### Directory Structure

- `apps/web/src/app/(dashboard)/` — Páginas del dashboard protegidas por auth
- `apps/web/src/app/(auth)/` — Login page
- `apps/web/src/app/api/` — API routes (incidents, sla, operators, alerts)
- `apps/web/src/components/dashboard/` — KPICard, AlertBanner, SLAGauge, IncidentsChart
- `apps/web/src/components/incidents/` — IncidentTable, SeverityBadge
- `apps/web/src/lib/queries/` — Lógica de DB separada de los API handlers
- `apps/web/src/lib/db.ts` — Singleton de PrismaClient
- `apps/web/src/lib/auth.ts` — Configuración NextAuth v5
- `apps/web/src/middleware.ts` — Protege rutas /(dashboard)/*
- `apps/worker/src/hpsm/` — Conexión, queries y normalización de HPSM
- `apps/worker/src/alerts/` — Motor de alertas y deduplicación Redis

### Key Patterns

- **Server Components por defecto.** `"use client"` solo cuando hay interactividad (polling, charts, tablas con estado).
- Todas las queries a DB van por `src/lib/queries/*.ts`, nunca inline en API routes.
- `PollingProvider` gestiona el intervalo global de refresco (10s). Los componentes se suscriben via TanStack Query.
- Badges de severidad usan clases CSS del design system: `.badge-critical`, `.badge-warning`, `.badge-success`, `.badge-info`, `.badge-low`.
- El worker usa upsert (`prisma.incident.upsert`) para no duplicar incidentes existentes.

## Design System

### Colors (Dark Mode NOC — siempre dark, sin toggle)

| Token CSS | Valor | Uso |
|-----------|-------|-----|
| `--background` | `#060d1a` | Fondo de página |
| `--surface` | `#0d1526` | Cards y paneles |
| `--surface-elevated` | `#152032` | Hover, modales |
| `--border` | `#1e3048` | Bordes |
| `--text-primary` | `#e2e8f0` | Texto principal |
| `--text-muted` | `#64748b` | Labels secundarios |
| `--accent` | `#3b82f6` | Acciones, info |
| `--critical` | `#ef4444` | CRITICAL |
| `--critical-dim` | `#1f1315` | Fondo CRITICAL |
| `--warning` | `#f59e0b` | HIGH / SLA en riesgo |
| `--warning-dim` | `#1c1609` | Fondo warning |
| `--success` | `#22c55e` | Resolved / SLA OK |
| `--success-dim` | `#0b1a0f` | Fondo success |
| `--info` | `#38bdf8` | MEDIUM / notificaciones |

En Tailwind: `bg-background`, `bg-surface`, `text-text-primary`, `text-critical`, `border-border`, etc.

### Typography

- Headings: Inter 700/600, escala 24/20/16px → `text-2xl font-bold`, `text-xl font-semibold`
- Body: Inter 400, 14px → default
- Métricas KPI: Inter 700, 32px → `text-4xl font-bold`
- Monospace (IDs, timestamps): JetBrains Mono 400, 12px → `font-mono text-xs`

### Layout

- Border radius: 4px badges, 6px default, 8px cards → `rounded`, `rounded-md`, `rounded-lg`
- Sin sombras grandes (`shadow-none`). Solo `transition-colors duration-150` en hovers.
- Row height tablas: 36px, padding horizontal: 12px.
- Sidebar: 240px (colapsado: 64px). Max content: 1440px.

## Environment Variables

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Postgres Neon connection string |
| `NEXTAUTH_SECRET` | JWT signing secret |
| `NEXTAUTH_URL` | URL base (localhost:3000 o Vercel URL) |
| `HPSM_HOST` | Host de la DB de HP Service Manager |
| `HPSM_PORT` | Puerto de HPSM DB |
| `HPSM_USER` | Usuario HPSM |
| `HPSM_PASSWORD` | Contraseña HPSM |
| `HPSM_DATABASE` | Nombre de la DB en HPSM |
| `REDIS_URL` | Upstash Redis URL |
| `RESEND_API_KEY` | API key de Resend para emails |
| `APERTURA_SERVICIOS` | Códigos de Servicio (prefijo antes del guion en serviceId) que disparan alerta de apertura por WhatsApp |
| `APERTURA_CHAT_IDS` | chatId(s) de WhatsApp (`xxxx@g.us`) destino de la alerta de apertura, separados por coma |

## Reglas No Negociables

1. **TypeScript strict, cero `any`.** Si un tipo es desconocido, usar `unknown` y narrowing.
2. **Nunca consultar HPSM desde el frontend.** Solo el worker toca HPSM.
3. **Paginación obligatoria.** Ninguna query devuelve más de 200 registros sin paginación explícita.
4. **Un componente por archivo, máximo 300 líneas.**
5. **Deduplicación de alertas vía Redis.** Nunca enviar más de 1 email por el mismo incidente dentro de 1 hora.
6. **Audit log en cada acción del usuario.**
7. **Nunca hardcodear credenciales.** Variables de entorno para todo.
