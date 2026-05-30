import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import { HpsmClient } from "../hpsm/client.js";
import { normalizeIncident } from "../hpsm/normalizer.js";
import { logger } from "../logger.js";

const adapter = new PrismaPg({ connectionString: config.database.url });
export const db = new PrismaClient({ adapter });

export async function syncIncidents(): Promise<{
  synced: number;
  errors: number;
}> {
  const hpsm = new HpsmClient();
  const groups = config.hpsm.assignmentGroups;

  let synced = 0;
  let errors = 0;

  for (const group of groups) {
    logger.info(`Sincronizando grupo: ${group}`);
    try {
      const rawIncidents = await hpsm.getIncidentsByGroup(group);
      logger.info(`Recibidos ${rawIncidents.length} incidentes de HPSM (${group})`);

      // Upsert en lotes de 50 para no sobrecargar
      const BATCH = 50;
      for (let i = 0; i < rawIncidents.length; i += BATCH) {
        const batch = rawIncidents.slice(i, i + BATCH);
        await Promise.allSettled(
          batch.map(async (raw) => {
            try {
              const normalized = normalizeIncident(raw);
              const rawJson = normalized.rawData as Prisma.InputJsonValue;
              await db.incident.upsert({
                where: { id: normalized.id },
                update: {
                  title: normalized.title,
                  severity: normalized.severity,
                  status: normalized.status,
                  assignedTo: normalized.assignedTo,
                  slaDeadline: normalized.slaDeadline,
                  slaBreached: normalized.slaBreached,
                  slaRiskAt: normalized.slaRiskAt,
                  rawData: rawJson,
                  updatedAt: normalized.updatedAt,
                  syncedAt: new Date(),
                },
                create: {
                  ...normalized,
                  rawData: rawJson,
                },
              });
              synced++;
            } catch (err) {
              logger.error(`Error en upsert ${raw.IncidentId}`, { err });
              errors++;
            }
          })
        );
      }
    } catch (err) {
      logger.error(`Error sincronizando grupo ${group}`, { err });
      errors++;
    }
  }

  return { synced, errors };
}
