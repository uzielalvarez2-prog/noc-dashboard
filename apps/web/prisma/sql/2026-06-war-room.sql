-- ─────────────────────────────────────────────────────────────────────────────
-- Migracion manual (Neon) — 3 tablas nuevas. Ejecutar UNA vez en produccion.
-- No toca tablas ni enums existentes. Idempotente (IF NOT EXISTS).
--
-- Tras correr esto:  pnpm --filter web exec prisma generate
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Clientes TOP — base editable empresa/servicio que dispara War Room.
--    Solo 2 campos de match (company, serviceRef). Crece de ~93 a ~300+.
CREATE TABLE IF NOT EXISTS "ClienteTop" (
  "id"         TEXT PRIMARY KEY,
  "company"    TEXT NOT NULL,
  "serviceRef" TEXT NOT NULL DEFAULT '',
  "note"       TEXT,
  "createdBy"  TEXT NOT NULL DEFAULT '',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Indices para match rapido por cualquiera de los dos criterios.
CREATE INDEX IF NOT EXISTS "ClienteTop_company_idx"    ON "ClienteTop" ("company");
CREATE INDEX IF NOT EXISTS "ClienteTop_serviceRef_idx" ON "ClienteTop" ("serviceRef");

-- 2. War Room — incidentes que coincidieron con un Cliente TOP. PERSISTE (no se
--    borra con el snapshot de abiertos) para guardar historial de 7 dias y medir
--    recurrencia. Upsert por incidentId: una fila por incidente.
CREATE TABLE IF NOT EXISTS "WarRoomIncident" (
  "incidentId" TEXT PRIMARY KEY,
  "openTime"   TIMESTAMP(3) NOT NULL,
  "status"     TEXT NOT NULL DEFAULT '',
  "company"    TEXT NOT NULL DEFAULT '',
  "serviceId"  TEXT NOT NULL DEFAULT '',
  "state"      TEXT NOT NULL DEFAULT '',
  "district"   TEXT NOT NULL DEFAULT '',
  "assignee"   TEXT,
  "group"      TEXT NOT NULL DEFAULT '',
  "matchedBy"  TEXT NOT NULL DEFAULT '',  -- 'company' | 'service' | 'both'
  "flagged"    BOOLEAN NOT NULL DEFAULT false,  -- bandera manual (check)
  "resolvedAt" TIMESTAMP(3),                    -- set cuando status -> resolv (alerta UP)
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "WarRoomIncident_company_idx"     ON "WarRoomIncident" ("company");
CREATE INDEX IF NOT EXISTS "WarRoomIncident_serviceId_idx"   ON "WarRoomIncident" ("serviceId");
CREATE INDEX IF NOT EXISTS "WarRoomIncident_firstSeenAt_idx" ON "WarRoomIncident" ("firstSeenAt");
CREATE INDEX IF NOT EXISTS "WarRoomIncident_resolvedAt_idx"  ON "WarRoomIncident" ("resolvedAt");

-- 3. Base de Conocimiento — enlaces/PDF/Drive con categoria. Admin administra.
CREATE TABLE IF NOT EXISTS "KnowledgeDoc" (
  "id"        TEXT PRIMARY KEY,
  "title"     TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "category"  TEXT NOT NULL DEFAULT 'General',  -- Manuales | Politicas | ...
  "docType"   TEXT NOT NULL DEFAULT 'LINK',      -- LINK | PDF | DRIVE
  "note"      TEXT,
  "createdBy" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "KnowledgeDoc_category_idx" ON "KnowledgeDoc" ("category");
