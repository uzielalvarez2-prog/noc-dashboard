import "dotenv/config";
import { uploadCsv } from "./upload.js";
import { config } from "./config.js";
import { join } from "node:path";

// Uso: node tsx src/upload-closed-now.ts [ruta-al-csv]
// Si no se pasa ruta, usa el ultimo CSV de cerrados del dia de hoy.
const now = new Date();
const defaultCsv = join(config.downloadDir, `closed-incidents-${now.toISOString().slice(0, 10)}.csv`);
const csvPath = process.argv[2] ?? defaultCsv;

console.log(`Subiendo ${csvPath} a ${config.dashboardUrl}...`);
await uploadCsv(csvPath, "PEXA", "closed");
console.log("Listo.");
