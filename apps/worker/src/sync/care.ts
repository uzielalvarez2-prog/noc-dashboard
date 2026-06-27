import { type Prisma } from "@prisma/client";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { CcClient } from "../cc/client.js";
import { normalizeOpen, normalizeClosed, isClosedStatus } from "../cc/normalizer.js";
import { db } from "./incidents.js";

// Las filas CARE se identifican por el prefijo del número (IMCARE...), lo que
// permite reemplazar SOLO el snapshot CARE sin tocar PEXA/CECOR (convivencia).
const CARE_PREFIX = "IMCARE";

export interface CareSyncResult {
  open: number;
  closed: number;
  errors: number;
}

/**
 * Ingesta de CARE desde la API de Control Center → Postgres.
 *  - Abiertos: snapshot (reemplaza solo filas CARE) en OpenIncident.
 *  - Cerrados: upsert por incidentId en ClosedIncident (con SLA 4h).
 * War Room queda pendiente (se conecta después, requiere sembrar Clientes TOP CARE).
 */
export async function syncCare(): Promise<CareSyncResult> {
  const cc = new CcClient();
  let errors = 0;

  // ── Abiertos: snapshot CARE ────────────────────────────────────────────────
  let openCount = 0;
  try {
    const openIncidents = await cc.getAllOpen();
    const records = openIncidents.map(normalizeOpen);
    logger.info(`CARE abiertos recibidos: ${records.length}`);

    await db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.openIncident.deleteMany({ where: { incidentId: { startsWith: CARE_PREFIX } } });
        if (records.length > 0) {
          await tx.openIncident.createMany({ data: records, skipDuplicates: true });
        }
      },
      { maxWait: 20_000, timeout: 90_000 }
    );
    openCount = records.length;
  } catch (err) {
    logger.error("Error sincronizando abiertos CARE", { err });
    errors++;
  }

  // ── Cerrados: upsert ────────────────────────────────────────────────────────
  let closedCount = 0;
  try {
    const feed = await cc.getIncidents();
    const closed = feed.filter((i) => isClosedStatus(i.problem_status));
    logger.info(`CARE cerrados en el feed: ${closed.length}`);

    for (const inc of closed) {
      const rec = normalizeClosed(inc);
      if (!rec) continue;
      try {
        await db.closedIncident.upsert({
          where: { incidentId: rec.incidentId },
          create: { ...rec, uploadedAt: new Date() },
          update: {
            group: rec.group,
            openTime: rec.openTime,
            closeTime: rec.closeTime,
            status: rec.status,
            closedBy: rec.closedBy,
            resAnalystCode: rec.resAnalystCode,
            resCause: rec.resCause,
            resolutionMins: rec.resolutionMins,
            slaBreached: rec.slaBreached,
            uploadedAt: new Date(),
          },
        });
        closedCount++;
      } catch (err) {
        logger.error(`Error upsert cerrado CARE ${rec.incidentId}`, { err });
        errors++;
      }
    }
  } catch (err) {
    logger.error("Error sincronizando cerrados CARE", { err });
    errors++;
  }

  return { open: openCount, closed: closedCount, errors };
}

/** ¿Hay credenciales/secreto CC configurados para correr la ingesta? */
export function isCareConfigured(): boolean {
  return Boolean(config.cc.user && config.cc.password && (config.cc.totpSecret || config.cc.totpCode));
}
