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

// Prefijo de la key sintética para resultados que matchearon por serviceRef
// en vez de company (ver getMonitoredIpMatches).
const SERVICE_KEY_PREFIX = "svc:";

export function serviceMatchKey(serviceId: string): string {
  return `${SERVICE_KEY_PREFIX}${norm(serviceId)}`;
}

/**
 * Match en memoria de empresas Y servicios contra la base de MonitoredIp — la IP
 * se prellena si coincide la columna Empresa O la columna Servicio, para que una
 * IP capturada bajo otra razón social igual aparezca cuando el número de servicio
 * es el mismo. Resultado indexado por company normalizada; las filas que solo
 * matchearon por servicio (no por company) se agregan además bajo la key
 * sintética `svc:<serviceRef normalizado>` para que el caller pueda hacer fallback.
 */
export async function getMonitoredIpMatches(
  companies: string[],
  services: string[] = [],
): Promise<Map<string, MonitoredIpRow[]>> {
  const wantedCompanies = new Set(companies.map(norm).filter(Boolean));
  const wantedServices = new Set(services.map(norm).filter(Boolean));
  if (wantedCompanies.size === 0 && wantedServices.size === 0) return new Map();

  const all = await db.monitoredIp.findMany();

  const byKey = new Map<string, MonitoredIpRow[]>();
  function add(key: string, row: MonitoredIpRow) {
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  }

  for (const row of all) {
    const co = norm(row.company);
    const svc = norm(row.serviceRef);
    if (wantedCompanies.has(co)) add(co, row);
    if (svc && wantedServices.has(svc)) add(serviceMatchKey(svc), row);
  }
  return byKey;
}

/** Monitoreos activos para un lote de incidentes (para pintar el badge de estado). */
export async function getActiveMonitorsForIncidents(incidentIds: string[]) {
  if (incidentIds.length === 0) return [];
  return db.ipMonitor.findMany({
    where: { incidentId: { in: incidentIds }, active: true },
    include: { monitoredIp: true },
  });
}
