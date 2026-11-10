import "dotenv/config";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import cron from "node-cron";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { startScraperServer } from "./server.js";

/**
 * Scheduler para correr el scraper en la nube (Railway) sin Task Scheduler.
 * Replica las tareas de Windows:
 *   - run-open:          cada 5 min, 06:00-23:00 CDMX
 *   - run-closed PEXA:   14:02 y 22:12 CDMX (espera hasta 5 min si open está corriendo)
 *   - run-closed CECOR:  21:00 CDMX (ventana de consulta 07:00-21:00 vía env override)
 * Cada corrida es un proceso hijo (aislamiento: un cuelgue no tumba el scheduler)
 * con timeout duro — si excede, se mata y la siguiente corrida del cron recupera.
 */

const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");
const TZ = "America/Mexico_City";
const DRY = process.env.SCHEDULER_DRY === "1";

/**
 * Interruptor de pausa SOLO para las descargas automáticas (open/sisa/closed).
 * Se lee en CADA disparo del cron (no al arrancar), así que basta con poner
 * SCHEDULER_PAUSED=1 en Railway y redeployar/reiniciar para pausar, y quitarla
 * o ponerla en 0 para reanudar — sin tocar código.
 *
 * NO afecta al servidor HTTP: el cierre de incidentes (/cerrar-incidentes) y el
 * estatus de IMs (/im-estatus) bajo demanda siguen vivos aunque esté pausado.
 * Son acciones manuales que tú disparas desde el dashboard, no descargas del cron.
 */
function downloadsPaused(): boolean {
  const v = (process.env.SCHEDULER_PAUSED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Intervalo (minutos) de las descargas de abiertos+sisa, configurable en Railway
 * vía OPEN_INTERVAL_MIN para subir/bajar la carga a HPSM sin tocar código.
 * Default 15 (antes 5). Volver a 5 = poner OPEN_INTERVAL_MIN=5 y redeployar.
 *
 * El cron usa el patrón "*​/N", que SOLO reparte parejo con divisores de 60; por
 * eso si el valor no es uno de ellos, cae al divisor válido más cercano (así nunca
 * se genera un patrón irregular tipo "*​/7" que dispararía de más al cruzar la hora).
 */
const VALID_INTERVALS = [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30];
function openIntervalMin(): number {
  const raw = Number((process.env.OPEN_INTERVAL_MIN ?? "").trim());
  if (!Number.isFinite(raw) || raw <= 0) return 15; // default
  if (VALID_INTERVALS.includes(raw)) return raw;
  // Divisor de 60 más cercano
  const nearest = VALID_INTERVALS.reduce((a, b) =>
    Math.abs(b - raw) < Math.abs(a - raw) ? b : a,
  );
  logger.info(
    `OPEN_INTERVAL_MIN=${raw} no es divisor de 60 — se usa el más cercano: ${nearest} min`,
  );
  return nearest;
}

const OPEN_TIMEOUT_MS = 12 * 60_000; // corrida sana ~2 min; degradada ~10 min
const CLOSED_TIMEOUT_MS = 30 * 60_000; // el export de cerrados tarda ~13 min normal
const SISA_TIMEOUT_MS = 12 * 60_000; // mismo margen que open — sesión HPSM completa propia
const IM_ESTATUS_TIMEOUT_MS = 30 * 60_000; // ~30 s por IM; tope de 50 IMs en server.ts
const IM_ESTATUS_WAIT_MS = 15 * 60_000; // bajo demanda: espera a que termine open/sisa/closed

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

function spawnScript(
  label: string,
  script: string,
  timeoutMs: number,
  envOverride: NodeJS.ProcessEnv = {},
): Promise<number> {
  return new Promise((resolve) => {
    // detached: true → el hijo arranca su propio grupo de procesos, así el
    // timeout puede matar al grupo COMPLETO (incluye Chromium/Playwright),
    // no solo al proceso tsx. Sin esto, un SIGKILL al hijo puede dejar
    // Chromium huérfano corriendo — eso es lo que agota el contenedor.
    const child = spawn(process.execPath, [TSX_CLI, script], {
      stdio: "inherit",
      env: { ...process.env, ...envOverride },
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
  envOverride: NodeJS.ProcessEnv = {},
): Promise<boolean> {
  if (running) {
    if (waitIfBusyMs <= 0) {
      logger.info(`${label}: ocupado con ${running} — saltado`);
      return false;
    }
    const deadline = Date.now() + waitIfBusyMs;
    while (running && Date.now() < deadline) await sleep(10_000);
    if (running) {
      logger.error(`${label}: ocupado con ${running} tras ${waitIfBusyMs / 1_000}s — abortado`);
      return false;
    }
  }
  running = label;
  const t0 = Date.now();
  logger.info(`${label}: inicio`);
  try {
    if (DRY) {
      logger.info(`${label}: DRY — no se ejecuta`);
      return false;
    }
    const code = await spawnScript(label, script, timeoutMs, envOverride);
    const secs = Math.round((Date.now() - t0) / 1_000);
    logger.info(`${label}: fin exit=${code} (${secs}s)`);
    return true;
  } finally {
    running = null;
  }
}

// SISA se encadena SIEMPRE después de run-open (nunca en paralelo): ambos usan
// la misma sesión única de login HPSM, y correrlos a la vez arriesga colisión
// ("Maximum active logins"). runJob ya serializa vía el flag `running`.
async function runOpenThenSisa(): Promise<void> {
  if (downloadsPaused()) {
    logger.info("run-open+sisa: SCHEDULER_PAUSED — descargas en pausa, saltado");
    return;
  }
  await runJob("run-open", "src/run-open.ts", OPEN_TIMEOUT_MS);
  await runJob("run-sisa", "src/run-sisa.ts", SISA_TIMEOUT_MS);
}

// Abiertos: cada OPEN_INTERVAL_MIN min de 06:00 a 22:59 + la de las 23:00
const OPEN_INTERVAL = openIntervalMin();
cron.schedule(`*/${OPEN_INTERVAL} 6-22 * * *`, () => void runOpenThenSisa(), {
  timezone: TZ,
});
cron.schedule("0 23 * * *", () => void runOpenThenSisa(), {
  timezone: TZ,
});
// Cerrados: mismo interruptor de pausa que open/sisa. Wrapper para no repetir el
// guard en cada corrida.
function runClosed(label: string, envOverride: NodeJS.ProcessEnv = {}): void {
  if (downloadsPaused()) {
    logger.info(`${label}: SCHEDULER_PAUSED — descargas en pausa, saltado`);
    return;
  }
  void runJob(label, "src/run-closed.ts", CLOSED_TIMEOUT_MS, 5 * 60_000, envOverride);
}

// Cerrados PEXA: 14:02 y 22:12 (mismos horarios que Task Scheduler; :02/:12 fuera de la rejilla de 5 min)
cron.schedule("2 14 * * *", () => runClosed("run-closed(PEXA)"), { timezone: TZ });
cron.schedule("12 22 * * *", () => runClosed("run-closed(PEXA)"), { timezone: TZ });

// ── Estatus Cliente TOP → WhatsApp (grupo "Supervision PEXA"): 09:00 y 20:00 ──
// NO entra a HPSM desde aquí: solo le pega al dashboard, que orquesta (lee los
// IMs del cliente TOP, pide al scraper su estatus vía /im-estatus, y envía el
// mensaje al grupo). Por eso no usa runJob — no compite por el login de HPSM;
// la consulta pesada la encola el propio dashboard contra el server HTTP de
// este proceso. Respeta el mismo interruptor de pausa que las descargas.
async function dispararEstatusClienteTop(): Promise<void> {
  if (downloadsPaused()) {
    logger.info("estatus-cliente-top: SCHEDULER_PAUSED — saltado");
    return;
  }
  const url = `${config.dashboardUrl.replace(/\/+$/, "")}/api/cliente-top/estatus-whatsapp`;
  try {
    logger.info("estatus-cliente-top: disparando corrida");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": config.internalApiKey },
      body: JSON.stringify({}),
      // La corrida puede tardar minutos (el dashboard espera al scraper IM por
      // IM). No bloqueamos tanto: damos un margen amplio pero acotado y, si el
      // dashboard sigue trabajando, igual terminará su envío por su cuenta.
      signal: AbortSignal.timeout(5 * 60_000),
    });
    const body = await res.text();
    logger.info(`estatus-cliente-top: dashboard respondió ${res.status} ${body.slice(0, 200)}`);
  } catch (err) {
    logger.error("estatus-cliente-top: fallo al disparar", { err: String(err) });
  }
}
cron.schedule("0 9 * * *", () => void dispararEstatusClienteTop(), { timezone: TZ });
cron.schedule("0 20 * * *", () => void dispararEstatusClienteTop(), { timezone: TZ });
// Cerrados CECOR: 21:00 (:00 se sale de la rejilla */5 de open? no — 21:00 sí cae en ella,
// por eso waitIfBusyMs=5min deja que un run-open en curso termine antes de arrancar).
// Ventana de consulta acotada a 07:00-21:00 vía HPSM_CLOSED_END_TIME para el hijo.
cron.schedule(
  "0 21 * * *",
  () =>
    runClosed("run-closed(CECOR)", {
      HPSM_CLOSED_GROUP: "CECOR",
      HPSM_CLOSED_END_TIME: "21:00",
    }),
  { timezone: TZ },
);

// Servidor HTTP para consultas bajo demanda del dashboard (estatus SISA en el
// portal Manto). Vive en ESTE proceso, no como job hijo: Manto es un sistema
// distinto de HPSM (sin riesgo de colisión de logins) y `server.ts` ya
// serializa sus consultas con su propio lock. No hay cron para Manto.
// La consulta de estatus de IMs SÍ entra a HPSM, así que va como job hijo por
// runJob: espera su turno detrás de open/sisa en vez de abrir otro login.
startScraperServer({
  runImEstatus: (env) =>
    runJob("run-im-estatus", "src/run-im-estatus.ts", IM_ESTATUS_TIMEOUT_MS, IM_ESTATUS_WAIT_MS, env),
  // Cierre de IMs: mismo molde que run-im-estatus (entra a HPSM, espera su
  // turno detrás de open/sisa/closed). ~30 s por IM (abre, aplica template,
  // cierra, reabre para verificar).
  runCerrar: (env) =>
    runJob("run-cerrar", "src/run-cerrar.ts", IM_ESTATUS_TIMEOUT_MS, IM_ESTATUS_WAIT_MS, env),
});

logger.info(
  `scheduler: iniciado (TZ ${TZ}) — open+sisa cada ${OPEN_INTERVAL} min 06:00-23:00, closed PEXA 14:02 y 22:12, closed CECOR 21:00, estatus Cliente TOP 09:00 y 20:00${DRY ? " [DRY]" : ""}${downloadsPaused() ? " [PAUSADO: descargas en pausa, cierre/estatus siguen activos]" : ""}`,
);
logger.info(`scheduler: tsx=${TSX_CLI}`);

// Corrida inmediata al arrancar (valida el deploy sin esperar al próximo múltiplo de 5)
const hourMx = Number(
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(
    new Date(),
  ),
);
if (downloadsPaused()) {
  logger.info("scheduler: SCHEDULER_PAUSED — sin corrida de arranque (cierre/estatus bajo demanda siguen activos)");
} else if (process.env.RUN_ON_BOOT !== "false" && hourMx >= 6 && hourMx < 23) {
  void runOpenThenSisa();
} else {
  logger.info("scheduler: fuera de ventana o RUN_ON_BOOT=false — sin corrida de arranque");
}
