import type { HpsmIncident } from "./client.js";

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type IncidentStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export interface NormalizedIncident {
  id: string;
  title: string;
  severity: Severity;
  status: IncidentStatus;
  assignedTo: string | null;
  slaDeadline: Date;
  slaBreached: boolean;
  slaRiskAt: Date | null;
  source: string;
  rawData: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** Mapea prioridad HPSM → severidad interna */
function mapSeverity(raw: HpsmIncident): Severity {
  const priority = String(raw.Priority ?? "").toLowerCase();
  if (priority === "1" || priority.includes("critical") || priority.includes("crítico")) return "CRITICAL";
  if (priority === "2" || priority.includes("high") || priority.includes("alto")) return "HIGH";
  if (priority === "3" || priority.includes("medium") || priority.includes("medio")) return "MEDIUM";
  return "LOW";
}

/** Mapea status HPSM → status interno */
function mapStatus(raw: HpsmIncident): IncidentStatus {
  const status = String(raw.Status ?? "").toLowerCase().replace(/\s+/g, "_");
  if (status.includes("open") && !status.includes("progress")) return "OPEN";
  if (status.includes("progress") || status.includes("work") || status.includes("assign")) return "IN_PROGRESS";
  if (status.includes("resolv")) return "RESOLVED";
  if (status.includes("clos") || status.includes("complet")) return "CLOSED";
  // Fallback: si el CSV usa los mismos valores que vimos
  if (status === "open") return "OPEN";
  if (status === "work_in_progress") return "IN_PROGRESS";
  if (status === "resolved") return "RESOLVED";
  if (status === "closed") return "CLOSED";
  if (status === "pending_customer" || status === "pending_vendor") return "IN_PROGRESS";
  return "OPEN";
}

function parseHpsmDate(raw: string | undefined): Date {
  if (!raw) return new Date();
  // HPSM puede devolver fechas en distintos formatos:
  // "2026-05-27T10:07:33Z" o "26/05/27 10:07:33" (formato del CSV)
  if (raw.includes("T") || raw.includes("-")) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  // Formato CSV: "YY/MM/DD HH:MM:SS"
  const [datePart, timePart = "00:00:00"] = raw.split(" ");
  const [yy, mm, dd] = datePart.split("/");
  const [hh, min, ss] = timePart.split(":");
  return new Date(
    2000 + parseInt(yy, 10),
    parseInt(mm, 10) - 1,
    parseInt(dd, 10),
    parseInt(hh, 10),
    parseInt(min, 10),
    parseInt(ss, 10)
  );
}

function computeSlaRiskAt(deadline: Date): Date | null {
  // Zona de riesgo = cuando queda el 20% del tiempo
  // Usamos 80% del tiempo transcurrido desde el SLA deadline como referencia
  // Como no tenemos el tiempo de inicio del SLA aquí, usamos deadline - 2h como proxy
  const riskMs = 2 * 60 * 60 * 1000; // 2 horas antes del deadline
  const riskAt = new Date(deadline.getTime() - riskMs);
  return riskAt;
}

export function normalizeIncident(raw: HpsmIncident): NormalizedIncident {
  const now = new Date();
  const openTime = parseHpsmDate(raw.OpenTime);
  const slaDeadline = raw.SlaVoDate
    ? parseHpsmDate(raw.SlaVoDate)
    : new Date(openTime.getTime() + 8 * 3600000); // fallback: 8h

  const slaBreached =
    String(raw.BrSlaStatus ?? "").toLowerCase().includes("breach") ||
    (slaDeadline < now && !["RESOLVED", "CLOSED"].includes(mapStatus(raw)));

  return {
    id: raw.IncidentId,
    title: raw.Title ?? raw.Description ?? `Incidente ${raw.IncidentId}`,
    severity: mapSeverity(raw),
    status: mapStatus(raw),
    assignedTo: raw.Assignee ?? null,
    slaDeadline,
    slaBreached,
    slaRiskAt: computeSlaRiskAt(slaDeadline),
    source: "HPSM",
    rawData: raw as Record<string, unknown>,
    createdAt: openTime,
    updatedAt: now,
  };
}
