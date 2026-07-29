import { db } from "@/lib/db";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export interface MonitoredIpFilters {
  q?: string;
}

/** Lista completa de la base de IPs (para la página de administración). */
export async function getMonitoredIps(filters: MonitoredIpFilters) {
  const q = filters.q?.trim();
  return db.monitoredIp.findMany({
    where: q
      ? {
          OR: [
            { ip: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { serviceRef: { contains: q, mode: "insensitive" } },
            { siglasIm: { contains: q, mode: "insensitive" } },
            { label: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { company: "asc" },
  });
}

export type MonitoredIpRow = Awaited<ReturnType<typeof getMonitoredIps>>[number];

/**
 * Match en memoria de una empresa contra la base de MonitoredIp — mismo criterio
 * que war-room.ts (company / serviceRef / siglasIm), para prellenar la columna IP
 * en la tabla de Incidentes Abiertos sin que el ADMIN la vuelva a capturar.
 */
export async function getMonitoredIpMatches(
  companies: string[],
): Promise<Map<string, MonitoredIpRow[]>> {
  const wanted = new Set(companies.map(norm).filter(Boolean));
  if (wanted.size === 0) return new Map();

  const all = await db.monitoredIp.findMany();
  const byCompany = new Map<string, MonitoredIpRow[]>();
  for (const row of all) {
    const co = norm(row.company);
    if (!wanted.has(co)) continue;
    const list = byCompany.get(co);
    if (list) list.push(row);
    else byCompany.set(co, [row]);
  }
  return byCompany;
}

/** Monitoreos activos para un lote de incidentes (para pintar el badge de estado). */
export async function getActiveMonitorsForIncidents(incidentIds: string[]) {
  if (incidentIds.length === 0) return [];
  return db.ipMonitor.findMany({
    where: { incidentId: { in: incidentIds }, active: true },
    include: { monitoredIp: true },
  });
}
