import "dotenv/config";
import { uploadCsv } from "./upload.js";
import { config } from "./config.js";
import { join } from "node:path";

const dest = join(config.downloadDir, "open-incidents.csv");
console.log(`Subiendo ${dest} a ${config.dashboardUrl} con clearOpen=true`);
await uploadCsv(dest, "PEXA,CECOR", "open");
console.log("Listo.");
