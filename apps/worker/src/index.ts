import "dotenv/config";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { syncIncidents, db } from "./sync/incidents.js";
import { HpsmClient } from "./hpsm/client.js";
import { isPaused } from "./schedule.js";
import { runIpMonitoringCycle } from "./monitoring/cycle.js";

const hpsm = new HpsmClient();

async function runCycle(): Promise<void> {
  if (isPaused()) {
    logger.debug("[schedule] Ventana de pausa nocturna — sync omitido (Neon duerme)");
    return;
  }

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
  logger.info(`  Pausa  : ${config.schedule.pauseStart}–${config.schedule.pauseEnd} (${config.schedule.timezone})`);
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

  // Ciclo de monitoreo de IP — independiente del sync HPSM y de isPaused(),
  // debe seguir funcionando de noche (ver apps/worker/src/monitoring/cycle.ts).
  const monitorInterval = setInterval(async () => {
    try {
      await runIpMonitoringCycle();
    } catch (err) {
      logger.error("Error en ciclo de monitoreo de IP", { err });
    }
  }, config.monitoring.intervalMs);

  // Heartbeat cada 60s (Railway monitoring)
  setInterval(() => logger.debug("[heartbeat] worker activo"), 60_000);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} recibido — cerrando...`);
    clearInterval(interval);
    clearInterval(monitorInterval);
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
