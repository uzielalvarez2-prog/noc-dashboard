import type { MonitoredIpMatch, ActiveIpMonitor } from "@/components/open/IpMonitorCell";

// Fetchers + selección de match de la columna "IP / Monitoreo", compartidos por
// las tablas que la muestran (Incidentes Abiertos y EDC → Total EDC).

export async function fetchMonitoredIpMatches(
  companies: string[],
): Promise<Record<string, MonitoredIpMatch[]>> {
  if (companies.length === 0) return {};
  // Un parámetro por empresa: hay nombres con coma ("BASHAM, RINGE Y CORREA")
  // y unirlos en un solo valor los partía en dos empresas inexistentes.
  const qs = new URLSearchParams();
  for (const c of companies) qs.append("company", c);
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
 * con C50-2510-0073 y C50-2510-0149). Preferir la fila cuyo serviceRef coincide
 * exactamente con el servicio del incidente; si ninguna coincide (IP capturada
 * sin serviceRef, o solo hay una), caer a la primera para no romper ese caso.
 */
export function pickIpMatch(
  matches: MonitoredIpMatch[] | undefined,
  serviceId: string,
): MonitoredIpMatch | undefined {
  if (!matches || matches.length === 0) return undefined;
  const svc = serviceId.trim().toLowerCase();
  return matches.find((m) => m.serviceRef.trim().toLowerCase() === svc) ?? matches[0];
}

/** Índice incidentId → monitor activo, para pintar el badge de estado por fila. */
export function indexMonitorsByIncident(
  monitors: ActiveIpMonitor[] | undefined,
): Map<string, ActiveIpMonitor> {
  return new Map((monitors ?? []).map((m) => [m.incidentId, m]));
}
