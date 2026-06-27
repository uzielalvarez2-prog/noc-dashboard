import "dotenv/config";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { syncIncidents, db } from "./sync/incidents.js";
import { syncCare, isCareConfigured } from "./sync/care.js";
import { HpsmClient } from "./hpsm/client.js";

const hpsm = new HpsmClient();

// CARE (API Control Center) corre en su propio intervalo, más espaciado que HPSM.
const CARE_POLL_MS = Number(process.env.CC_POLL_MS ?? 300_000);

async function runCareCycle(): Promise<void> {
  try {
    const { open, closed, errors } = await syncCare();
    if (open > 0 || closed > 0 || errors > 0) {
      logger.info(`Sync CARE: ${open} abiertos, ${closed} cerrados, ${errors} errores`);
    }
  } catch (err) {
    logger.error("Error fatal en ciclo CARE", { err });
  }
}

async function runCycle(): Promise<void> {
  const cycleStart = Date.now();

  const { synced, errors } = await syncIncidents();
  if (synced > 0 || errors > 0) {
    logger.info(`Sync HPSM: ${synced} upserts, ${errors} errores`);
  }

  const elapsed = Date.now() - cycleStart;
  logger.debug(`Ciclo en ${elapsed}ms`);
}

async function main(): Promise<void> {
  logger.info("═══════════════════════════════════════");
  logger.info("  NOC Worker arrancando...");
  logger.info(`  HPSM   : ${config.hpsm.baseUrl}`);
  logger.info(`  Grupos : ${config.hpsm.assignmentGroups.join(", ")}`);
  logger.info(`  Polling: ${config.poll.intervalMs}ms`);
  logger.info("═══════════════════════════════════════");

  // Verificar conexión a HPSM
  const hpsmOk = await hpsm.ping();
  logger.info(`HPSM ping: ${hpsmOk ? "✓ OK" : "✗ sin conexión (se reintentará)"}`);

  // Primer ciclo inmediato
  await runCycle();

  // Ciclo periódico
  const interval = setInterval(async () => {
    try {
      await runCycle();
    } catch (err) {
      logger.error("Error fatal en ciclo", { err });
    }
  }, config.poll.intervalMs);

  // CARE: ingesta desde la API de Control Center (si está configurada).
  let careInterval: NodeJS.Timeout | null = null;
  if (isCareConfigured()) {
    logger.info(`  CARE   : ${config.cc.apiBase} (cada ${CARE_POLL_MS}ms)`);
    await runCareCycle();
    careInterval = setInterval(runCareCycle, CARE_POLL_MS);
  } else {
    logger.info("  CARE   : sin configurar (faltan CC_* / TOTP) — omitido");
  }

  // Heartbeat cada 60s (Railway monitoring)
  setInterval(() => logger.debug("[heartbeat] worker activo"), 60_000);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} recibido — cerrando...`);
    clearInterval(interval);
    if (careInterval) clearInterval(careInterval);
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error("Error fatal al iniciar worker", { err });
  process.exit(1);
});
