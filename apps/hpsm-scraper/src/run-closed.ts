import { join } from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { downloadClosed } from "./download-closed.js";
import { uploadCsv } from "./upload.js";

// La cuenta ualvarez es compartida humano/bot: 2026-07-12 y 07-13 el login falló
// justo 14:02-14:15 (13 min) los dos días, coincidiendo con uso humano de la cuenta
// a esa hora. run-closed solo corre 1 vez al día en cada horario (14:02 / 22:12) —
// a diferencia de run-open (cron cada 5 min), si falla aquí no hay otra oportunidad
// hasta el siguiente horario programado. Reintentar 8 veces cada 2 min (~16 min de
// margen, cabe holgado en CLOSED_TIMEOUT_MS=30min) para sobrevivir ese tipo de colisión
// sin necesitar recuperación manual.
const MAX_ATTEMPTS = 8;
const RETRY_DELAY_MS = 2 * 60_000;

async function downloadClosedWithRetry(): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      logger.info(`Intento ${attempt}/${MAX_ATTEMPTS}: descargando incidentes cerrados...`);
      await downloadClosed();
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_ATTEMPTS) {
        logger.warn(
          `Intento ${attempt} falló: ${lastError.message}. Reintentando en ${RETRY_DELAY_MS / 1_000}s...`,
        );
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  throw lastError ?? new Error("Descarga falló (sin detalles)");
}

async function run(): Promise<void> {
  const now = new Date();
  const dest = join(
    config.downloadDir,
    `closed-incidents-${now.toISOString().slice(0, 10)}.csv`,
  );

  logger.info("=== run-closed: inicio ===");
  await downloadClosedWithRetry();

  logger.info(`Subiendo incidentes cerrados al dashboard (${config.closed.group})...`);
  await uploadCsv(dest, config.closed.group, "closed");

  logger.info("=== run-closed: completado ===");
}

run().catch((err) => {
  logger.error("Error en run-closed", { err: String(err) });
  process.exit(1);
});
