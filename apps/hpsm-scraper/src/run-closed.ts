import { join } from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { downloadClosed } from "./download-closed.js";
import { uploadCsv } from "./upload.js";

async function run(): Promise<void> {
  const now = new Date();
  const dest = join(
    config.downloadDir,
    `closed-incidents-${now.toISOString().slice(0, 10)}.csv`,
  );

  logger.info("=== run-closed: inicio ===");
  await downloadClosed();

  logger.info("Subiendo incidentes cerrados al dashboard (PEXA)...");
  await uploadCsv(dest, config.closed.group, "closed");

  logger.info("=== run-closed: completado ===");
}

run().catch((err) => {
  logger.error("Error en run-closed", { err: String(err) });
  process.exit(1);
});
