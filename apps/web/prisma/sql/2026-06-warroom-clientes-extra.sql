-- ─────────────────────────────────────────────────────────────────────────────
-- Migracion manual (Neon) — 3 columnas nuevas. Ejecutar UNA vez en produccion.
-- Solo agrega columnas (aditivo, seguro). Idempotente (IF NOT EXISTS).
--
-- Tras correr esto:  pnpm --filter web exec prisma generate
-- ─────────────────────────────────────────────────────────────────────────────

-- Clientes TOP: Siglas IM — primer criterio de match/busqueda.
ALTER TABLE "ClienteTop" ADD COLUMN IF NOT EXISTS "siglasIm" TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "ClienteTop_siglasIm_idx" ON "ClienteTop" ("siglasIm");

-- War Room: nota editable + bandera de "quitar de la vista" (boton X).
ALTER TABLE "WarRoomIncident" ADD COLUMN IF NOT EXISTS "note"      TEXT;
ALTER TABLE "WarRoomIncident" ADD COLUMN IF NOT EXISTS "dismissed" BOOLEAN NOT NULL DEFAULT false;
