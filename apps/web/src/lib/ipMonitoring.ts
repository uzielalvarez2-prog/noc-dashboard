import type { MonitoredIpMatch, ActiveIpMonitor } from "@/components/open/IpMonitorCell";

// Fetchers + selección de match de la columna "IP / Monitoreo", compartidos por
// las tablas que la muestran (Incidentes Abiertos y EDC → Total EDC).

// Debe reflejar serviceMatchKey() en lib/queries/monitoredIps.ts.
function serviceMatchKey(serviceId: string): string {
  return `svc:${serviceId.trim().toLowerCase()}`;
}

export async function fetchMonitoredIpMatches(
  companies: string[],
  services: string[] = [],
): Promise<Record<string, MonitoredIpMatch[]>> {
  if (companies.length === 0 && services.length === 0) return {};
  // Un parámetro por empresa: hay nombres con coma ("BASHAM, RINGE Y CORREA")
  // y unirlos en un solo valor los partía en dos empresas inexistentes. Mismo
  // patrón para servicio, que ahora también dispara el match (además de empresa).
  const qs = new URLSearchParams();
  for (const c of companies) qs.append("company", c);
  for (const s of services) qs.append("service", s);
  const res = await fetch(`/api/monitored-ips/lookup?${qs}`);
  if (!res.ok) return {};
  const data = await res.json();
  return data.matches ?? {};
}

export async function fetchActiveMonitors(incidentIds: string[]): Promise<ActiveIpMonitor[]> {
  if (incidentIds.length === 0) return [];
  const res = await fetch(
    `/api/monitored-ips/monitors?incidentIds=${encodeURIComponent(incidentIds.join(","))}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.monitors ?? [];
}

/**
 * Una empresa puede tener varias IPs registradas (una por servicio, ej. INGENICO
 * con C50-2510-0073 y C50-2510-0149, o SMART FIT con un sitio por servicio).
 * Preferir la fila cuyo serviceRef coincide exactamente con el servicio del
 * incidente. Si ninguna coincide, caer a la primera SOLO cuando ninguna fila de
 * la empresa tiene serviceRef capturado (IP vieja, capturada sin distinguir
 * sitios) — si ya hay filas con serviceRef propio, la empresa se captura por
 * sitio y no hay que prestarle a esta fila la IP de otro sitio distinto.
 */
export function pickIpMatch(
  matches: MonitoredIpMatch[] | undefined,
  serviceId: string,
): MonitoredIpMatch | undefined {
  if (!matches || matches.length === 0) return undefined;
  const svc = serviceId.trim().toLowerCase();
  const exact = matches.find((m) => m.serviceRef.trim().toLowerCase() === svc);
  if (exact) return exact;
  const anyHasServiceRef = matches.some((m) => m.serviceRef.trim() !== "");
  return anyHasServiceRef ? undefined : matches[0];
}

/**
 * Servicio primero: es la referencia que NO se repite entre sitios de una misma
 * empresa (varias sucursales comparten razón social pero cada una tiene su propio
 * número de servicio). Si el servicio no matchea nada (IP capturada sin
 * serviceRef, o dato no cargado aún), cae a Empresa para no perder el caso de
 * clientes con un solo sitio.
 */
export function pickIpMatchForRow(
  matchesByKey: Record<string, MonitoredIpMatch[]> | undefined,
  company: string,
  serviceId: string,
): MonitoredIpMatch | undefined {
  if (!matchesByKey) return undefined;
  const byService = matchesByKey[serviceMatchKey(serviceId)];
  if (byService && byService.length > 0) return byService[0];
  return pickIpMatch(matchesByKey[company.trim().toLowerCase()], serviceId);
}

/** Índice incidentId → monitor activo, para pintar el badge de estado por fila. */
export function indexMonitorsByIncident(
  monitors: ActiveIpMonitor[] | undefined,
): Map<string, ActiveIpMonitor> {
  return new Map((monitors ?? []).map((m) => [m.incidentId, m]));
}
