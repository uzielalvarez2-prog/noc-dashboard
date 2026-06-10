import { join } from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { downloadOpen } from "./download-open.js";
import { uploadCsv } from "./upload.js";

async function run(): Promise<void> {
  const dest = join(config.downloadDir, "open-incidents.csv");

  logger.info("=== run-open: inicio ===");
  await downloadOpen();

  logger.info("Subiendo incidentes abiertos al dashboard (PEXA + CECOR)...");
  await uploadCsv(dest, "PEXA,CECOR", true);

  logger.info("=== run-open: completado ===");
}

run().catch((err) => {
  logger.error("Error en run-open", { err: String(err) });
  process.exit(1);
});
