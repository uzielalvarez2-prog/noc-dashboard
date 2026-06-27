import type { CcIncident } from "./client.js";

// SLA NOC = 4 h (igual que el flujo CSV: lib/csv/hpsm.ts SLA_MINUTES).
export const SLA_MINUTES = 240;

/** Parsea fechas de Control Center con formato "DD/MM/YYYY HH:mm:ss". */
export function parseCcDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
  return isNaN(d.getTime()) ? null : d;
}

/** open_time_e (epoch s) es la fuente más limpia; cae a open_time string si falta. */
function openDate(inc: CcIncident): Date {
  if (inc.open_time_e) return new Date(inc.open_time_e * 1000);
  return parseCcDate(inc.open_time) ?? new Date();
}

export interface OpenRecord {
  incidentId: string;
  openTime: Date;
  status: string;
  company: string;
  serviceId: string;
  state: string;
  district: string;
  assignee: string | null;
  group: string;
}

/**
 * CARE → OpenIncident. CARE es infra-céntrico:
 *  - company viene null → ""
 *  - state/district se repurponen a Sitio/Host (location / location_code)
 *  - serviceId = affected_service (llave de match para Clientes TOP en CARE)
 */
export function normalizeOpen(inc: CcIncident): OpenRecord {
  return {
    incidentId: inc.number,
    openTime: openDate(inc),
    status: inc.problem_status ?? "",
    company: inc.company ?? "",
    serviceId: inc.affected_service ?? "",
    state: inc.location ?? "",
    district: inc.location_code ?? "",
    assignee: inc.operator ?? null,
    group: inc.group,
  };
}

export interface ClosedRecord {
  incidentId: string;
  group: string;
  openTime: Date;
  closeTime: Date;
  status: string;
  closedBy: string;
  resAnalystCode: string;
  resCause: string;
  resolutionMins: number;
  slaBreached: boolean;
}

/**
 * CARE → ClosedIncident. MTTR medido apertura → resolución (resolved_time, que
 * es cuando el servicio se restableció); cae a close_time si no hay resolved.
 * resCause = primer segmento del closure_code (igual que el flujo CSV con
 * resAnalystCode), ej. "SERVICE STABLE | NA | NA" → "SERVICE STABLE".
 */
export function normalizeClosed(inc: CcIncident): ClosedRecord | null {
  const closeTime = parseCcDate(inc.resolved_time) ?? parseCcDate(inc.close_time);
  if (!closeTime) return null;
  const openTime = openDate(inc);
  const resAnalystCode = inc.closure_code ?? inc.resolution_code ?? "";
  const resCause = resAnalystCode.split("|")[0].trim() || "SIN CLASIFICAR";
  const resolutionMins = Math.max(0, Math.round((closeTime.getTime() - openTime.getTime()) / 60000));
  return {
    incidentId: inc.number,
    group: inc.group,
    openTime,
    closeTime,
    status: inc.problem_status ?? "Closed",
    closedBy: inc.operator ?? "",
    resAnalystCode,
    resCause,
    resolutionMins,
    slaBreached: resolutionMins > SLA_MINUTES,
  };
}

const CLOSED_STATUSES = new Set(["closed", "canceled", "cancelled"]);
export function isClosedStatus(status: string | null | undefined): boolean {
  return CLOSED_STATUSES.has((status ?? "").trim().toLowerCase());
}
