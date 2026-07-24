import { join } from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { downloadSisa } from "./download-sisa.js";
import { uploadCsv } from "./upload.js";

async function run(): Promise<void> {
  const dest = join(config.downloadDir, "sisa-tickets.csv");

  logger.info("=== run-sisa: inicio ===");
  await downloadSisa();

  logger.info("Subiendo tickets SISA al dashboard...");
  await uploadCsv(dest, "PEXA", "sisa");

  logger.info("=== run-sisa: completado ===");
}

run().catch((err) => {
  logger.error("Error en run-sisa", { err: String(err) });
  process.exit(1);
});
