import "dotenv/config";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import cron from "node-cron";
import { logger } from "./logger.js";

/**
 * Scheduler para correr el scraper en la nube (Railway) sin Task Scheduler.
 * Replica las tareas de Windows:
 *   - run-open:   cada 5 min, 06:00-23:00 CDMX
 *   - run-closed: 14:02 y 22:12 CDMX (espera hasta 5 min si open está corriendo)
 * Cada corrida es un proceso hijo (aislamiento: un cuelgue no tumba el scheduler)
 * con timeout duro — si excede, se mata y la siguiente corrida del cron recupera.
 */

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");
const TZ = "America/Mexico_City";
const DRY = process.env.SCHEDULER_DRY === "1";

const OPEN_TIMEOUT_MS = 12 * 60_000; // corrida sana ~2 min; degradada ~10 min
const CLOSED_TIMEOUT_MS = 30 * 60_000; // el export de cerrados tarda ~13 min normal

let running: string | null = null;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * EAGAIN en spawn = el contenedor se quedó sin recursos (memoria/PIDs) para
 * lanzar procesos nuevos — no es un fallo de ESTA corrida, es el contenedor
 * entero degradado. Reintentar aquí no arregla nada; hay que tirar el proceso
 * completo para que Railway (restartPolicyType=ALWAYS) levante uno fresco.
 */
function isResourceExhausted(err: NodeJS.ErrnoException): boolean {
  return err.code === "EAGAIN" || err.code === "ENOMEM";
}

function spawnScript(label: string, script: string, timeoutMs: number): Promise<number> {
  return new Promise((resolve) => {
    // detached: true → el hijo arranca su propio grupo de procesos, así el
    // timeout puede matar al grupo COMPLETO (incluye Chromium/Playwright),
    // no solo al proceso tsx. Sin esto, un SIGKILL al hijo puede dejar
    // Chromium huérfano corriendo — eso es lo que agota el contenedor.
    const child = spawn(process.execPath, [TSX_CLI, script], {
      stdio: "inherit",
      env: process.env,
      detached: true,
    });
    const timer = setTimeout(() => {
      logger.error(`${label}: excedió ${timeoutMs / 60_000} min — matando grupo de procesos`);
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (err) {
          logger.error(`${label}: fallo matando grupo de procesos`, { err: String(err) });
        }
      }
    }, timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      logger.error(`${label}: error al lanzar proceso`, { err: String(err) });
      if (isResourceExhausted(err)) {
        logger.error(
          `${label}: contenedor sin recursos (${err.code}) — reiniciando proceso para que Railway levante uno fresco`,
        );
        // Pequeña espera para que el log anterior llegue a stdout antes de morir.
        setTimeout(() => process.exit(1), 500);
        return;
      }
      resolve(1);
    });
  });
}

async function runJob(
  label: string,
  script: string,
  timeoutMs: number,
  waitIfBusyMs = 0,
): Promise<void> {
  if (running) {
    if (waitIfBusyMs <= 0) {
      logger.info(`${label}: ocupado con ${running} — saltado`);
      return;
    }
    const deadline = Date.now() + waitIfBusyMs;
    while (running && Date.now() < deadline) await sleep(10_000);
    if (running) {
      logger.error(`${label}: ocupado con ${running} tras ${waitIfBusyMs / 1_000}s — abortado`);
      return;
    }
  }
  running = label;
  const t0 = Date.now();
  logger.info(`${label}: inicio`);
  try {
    if (DRY) {
      logger.info(`${label}: DRY — no se ejecuta`);
      return;
    }
    const code = await spawnScript(label, script, timeoutMs);
    const secs = Math.round((Date.now() - t0) / 1_000);
    logger.info(`${label}: fin exit=${code} (${secs}s)`);
  } finally {
    running = null;
  }
}

// Abiertos: cada 5 min de 06:00 a 22:55 + la de las 23:00
cron.schedule("*/5 6-22 * * *", () => void runJob("run-open", "src/run-open.ts", OPEN_TIMEOUT_MS), {
  timezone: TZ,
});
cron.schedule("0 23 * * *", () => void runJob("run-open", "src/run-open.ts", OPEN_TIMEOUT_MS), {
  timezone: TZ,
});
// Cerrados: 14:02 y 22:12 (mismos horarios que Task Scheduler; :02/:12 fuera de la rejilla de 5 min)
cron.schedule(
  "2 14 * * *",
  () => void runJob("run-closed", "src/run-closed.ts", CLOSED_TIMEOUT_MS, 5 * 60_000),
  { timezone: TZ },
);
cron.schedule(
  "12 22 * * *",
  () => void runJob("run-closed", "src/run-closed.ts", CLOSED_TIMEOUT_MS, 5 * 60_000),
  { timezone: TZ },
);

logger.info(
  `scheduler: iniciado (TZ ${TZ}) — open */5 06:00-23:00, closed 14:02 y 22:12${DRY ? " [DRY]" : ""}`,
);
logger.info(`scheduler: tsx=${TSX_CLI}`);

// Corrida inmediata al arrancar (valida el deploy sin esperar al próximo múltiplo de 5)
const hourMx = Number(
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(
    new Date(),
  ),
);
if (process.env.RUN_ON_BOOT !== "false" && hourMx >= 6 && hourMx < 23) {
  void runJob("run-open(arranque)", "src/run-open.ts", OPEN_TIMEOUT_MS);
} else {
  logger.info("scheduler: fuera de ventana o RUN_ON_BOOT=false — sin corrida de arranque");
}
