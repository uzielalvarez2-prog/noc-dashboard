-- Bandera manual visual para Escalados-EDC. Aditiva, sin tocar datos.
ALTER TABLE "EscalatedIncident"
  ADD COLUMN IF NOT EXISTS "flagged" BOOLEAN NOT NULL DEFAULT false;
