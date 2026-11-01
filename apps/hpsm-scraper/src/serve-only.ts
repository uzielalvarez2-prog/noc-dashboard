import "dotenv/config";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { logger } from "./logger.js";
import { startScraperServer } from "./server.js";

/**
 * Arranque MÍNIMO del servidor HTTP del scraper, SIN crons ni corrida de
 * arranque — solo para probar en local los endpoints bajo demanda
 * (/cerrar-incidentes, /im-estatus, /sisa-estatus). A diferencia de
 * scheduler.ts, no agenda nada ni dispara run-open al arrancar, así que no gasta
 * sesiones de HPSM salvo cuando TÚ pegas IMs desde el dashboard.
 *
 * Uso (PowerShell, desde apps/hpsm-scraper):
 *   pnpm tsx src/serve-only.ts
 */

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");

// Un job a la vez: igual que el scheduler, un lock evita abrir dos Chromium.
let running: string | null = null;

function runJob(label: string, script: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  if (running) {
    logger.info(`${label}: ocupado con ${running} — rechazado`);
    return Promise.resolve(false);
  }
  running = label;
  logger.info(`${label}: inicio`);
  return new Promise<boolean>((resolve) => {
    const child = spawn(process.execPath, [TSX_CLI, script], {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("exit", (code) => {
      logger.info(`${label}: fin exit=${code}`);
      running = null;
      resolve(true);
    });
    child.on("error", (err) => {
      logger.error(`${label}: error al lanzar`, { err: String(err) });
      running = null;
      resolve(false);
    });
  });
}

startScraperServer({
  runImEstatus: (env) => runJob("run-im-estatus", "src/run-im-estatus.ts", env),
  runCerrar: (env) => runJob("run-cerrar", "src/run-cerrar.ts", env),
});

logger.info("serve-only: servidor del scraper listo (sin crons). Endpoints bajo demanda activos.");
