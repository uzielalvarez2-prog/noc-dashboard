import { join } from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { downloadClosed } from "./download-closed.js";
import { uploadCsv } from "./upload.js";

async function downloadClosedWithRetry(): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      logger.info(`Intento ${attempt}/2: descargando incidentes cerrados...`);
      await downloadClosed();
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < 2) {
        logger.warn(`Intento ${attempt} falló: ${lastError.message}. Reintentando en 5s...`);
        await new Promise(r => setTimeout(r, 5_000));
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

  logger.info("Subiendo incidentes cerrados al dashboard (PEXA)...");
  await uploadCsv(dest, config.closed.group, "closed");

  logger.info("=== run-closed: completado ===");
}

run().catch((err) => {
  logger.error("Error en run-closed", { err: String(err) });
  process.exit(1);
});
