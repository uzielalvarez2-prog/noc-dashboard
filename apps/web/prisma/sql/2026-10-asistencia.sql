-- ============================================================
-- ASISTENCIA — control de asistencia de colaboradores (solo ADMIN)
-- Ejecutar en Neon SQL Editor (noc-dashboard prod) o con:
--   node scripts/apply-sql.mjs prisma/sql/2026-10-asistencia.sql
-- Solo crea tablas nuevas (aditivo, seguro). Idempotente (IF NOT EXISTS).
--
-- Tras correr esto:  npx prisma generate
-- ============================================================

-- 1. Colaborador — el padrón del equipo. Una fila por persona.
--    "grupo" = Matutino / Vespertino / CECOR (el turno general al que pertenece).
--    "usuario" = login HPSM (dmorelos, etc.); sirve para cruzar con otras vistas.
CREATE TABLE IF NOT EXISTS "Colaborador" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "nombre"    TEXT NOT NULL,
  "usuario"   TEXT NOT NULL DEFAULT '',
  "grupo"     TEXT NOT NULL DEFAULT '',
  "activo"    BOOLEAN NOT NULL DEFAULT true,
  "orden"     INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Colaborador_grupo_idx"  ON "Colaborador" ("grupo");
CREATE INDEX IF NOT EXISTS "Colaborador_activo_idx" ON "Colaborador" ("activo");

-- 2. HorarioBase — el horario semanal por colaborador. Una fila por día (0=Dom..6=Sab).
--    "horario" = texto tal cual "07:00 - 15:00"; vacío/ausente = descanso.
--    De aquí sale quién "debe estar" cada fecha y la cobertura por día.
CREATE TABLE IF NOT EXISTS "HorarioBase" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "colaboradorId"  TEXT NOT NULL,
  "dia"            INTEGER NOT NULL,
  "horario"        TEXT NOT NULL DEFAULT '',
  CONSTRAINT "HorarioBase_colaborador_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "HorarioBase_colaborador_dia_key"
  ON "HorarioBase" ("colaboradorId", "dia");

-- 3. AsistenciaEvento — SOLO las excepciones del día (no hay pase de lista diario).
--    Se asume que cada quien cumplió su horario base salvo que exista un evento.
--    "fecha" = día del evento (medianoche, sin hora, zona México).
--    "tipo"  = FALTA | RETARDO | PERMISO | VACACIONES | INCAPACIDAD | AVISO |
--              CAMBIO_DIA | CAMBIO_HORARIO | NOTA
--    "fechaRelacionada" = para CAMBIO_DIA: el día que se permuta (trabaja X por Y).
CREATE TABLE IF NOT EXISTS "AsistenciaEvento" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "colaboradorId"    TEXT NOT NULL,
  "fecha"            TIMESTAMP(3) NOT NULL,
  "tipo"             TEXT NOT NULL,
  "nota"             TEXT NOT NULL DEFAULT '',
  "fechaRelacionada" TIMESTAMP(3),
  "createdBy"        TEXT NOT NULL DEFAULT '',
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AsistenciaEvento_colaborador_fkey"
    FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "AsistenciaEvento_fecha_idx"       ON "AsistenciaEvento" ("fecha");
CREATE INDEX IF NOT EXISTS "AsistenciaEvento_colaborador_idx" ON "AsistenciaEvento" ("colaboradorId");
