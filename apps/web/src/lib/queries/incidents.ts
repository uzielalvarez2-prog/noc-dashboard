import { db } from "@/lib/db";
import type { Severity, IncidentStatus } from "@/types";

interface IncidentFilters {
  page?: number;
  limit?: number;
  severity?: Severity;
  status?: IncidentStatus;
  assignedTo?: string;
  slaRisk?: boolean;
}

export async function getIncidents(filters: IncidentFilters = {}) {
  const { page = 1, limit = 50, severity, status, assignedTo, slaRisk } = filters;
  const take = Math.min(limit, 200);
  const skip = (page - 1) * take;

  const where = {
    ...(severity && { severity }),
    ...(status && { status }),
    ...(assignedTo && { assignedTo }),
    ...(slaRisk && { slaRiskAt: { lte: new Date() }, slaBreached: false }),
  };

  const [data, total] = await Promise.all([
    db.incident.findMany({
      where,
      orderBy: [{ severity: "asc" }, { slaDeadline: "asc" }],
      take,
      skip,
    }),
    db.incident.count({ where }),
  ]);

  const lastSync = await db.incident
    .findFirst({ orderBy: { syncedAt: "desc" } })
    .then((r) => r?.syncedAt?.toISOString() ?? new Date().toISOString());

  return { data, meta: { total, page, limit: take, lastSync } };
}

export async function getIncidentById(id: string) {
  return db.incident.findUnique({ where: { id } });
}

const SLA_MINS = 240; // 4 horas — mismo umbral que closedIncident.slaBreached

export async function getKPIs() {
  const now = new Date();
  const slaBreachThreshold = new Date(now.getTime() - SLA_MINS * 60_000);
  const slaRiskThreshold = new Date(now.getTime() - SLA_MINS * 0.8 * 60_000); // 80% = 3.2h
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [openRows, closedToday, uploadedAtRow] = await Promise.all([
    db.openIncident.findMany({
      select: { incidentId: true, openTime: true, status: true, group: true, assignee: true },
      orderBy: { openTime: "asc" },
    }),
    db.closedIncident.count({ where: { closeTime: { gte: todayStart } } }),
    db.openIncident.findFirst({
      orderBy: { uploadedAt: "desc" },
      select: { uploadedAt: true },
    }),
  ]);

  // Deduplicar por incidentId conservando el openTime más antiguo
  const incidentMap = new Map<string, (typeof openRows)[0]>();
  for (const r of openRows) {
    const prev = incidentMap.get(r.incidentId);
    if (!prev || r.openTime < prev.openTime) incidentMap.set(r.incidentId, r);
  }
  const incidents = [...incidentMap.values()];

  const breached = incidents.filter((r) => r.openTime <= slaBreachThreshold);
  const atRisk = incidents.filter(
    (r) => r.openTime > slaBreachThreshold && r.openTime <= slaRiskThreshold
  );

  const criticalIncidents = breached.slice(0, 10).map((r) => ({
    id: r.incidentId,
    title: `${r.incidentId} — ${r.group}`,
    group: r.group,
    severity: "HIGH" as const,
    status: r.status,
    assignedTo: r.assignee,
    slaDeadline: new Date(r.openTime.getTime() + SLA_MINS * 60_000).toISOString(),
    slaBreached: true,
    openTime: r.openTime.toISOString(),
  }));

  return {
    totalOpen: incidents.length,
    criticalActive: breached.length,
    slaAtRisk: atRisk.length,
    closedToday,
    criticalIncidents,
    lastSync: uploadedAtRow?.uploadedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export interface TrendPoint {
  hour: string;
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
}

/** Devuelve conteos de incidentes por dia — solo dias con datos (hasta 30 dias atras). */
export async function getOpenByDay(): Promise<{ day: string; total: number }[]> {
  const result = [];
  for (let i = 29; i >= 0; i--) {
    const start = new Date();
    start.setDate(start.getDate() - i);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const total = await db.incident.count({
      where: { createdAt: { gte: start, lte: end }, status: { in: ["OPEN", "IN_PROGRESS"] } },
    });
    if (total > 0) {
      result.push({
        day: start.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit" }),
        total,
      });
    }
  }
  return result;
}

/** Devuelve conteos por hora en las últimas 24h para el chart de tendencia. */
export async function getIncidentTrend(): Promise<TrendPoint[]> {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 3600000);

  const incidents = await db.incident.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true, severity: true },
  });

  const buckets: Record<string, Record<string, number>> = {};
  for (let i = 0; i < 24; i++) {
    const h = new Date(since.getTime() + i * 3600000);
    const label = `${String(h.getHours()).padStart(2, "0")}:00`;
    buckets[label] = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  }

  for (const inc of incidents) {
    const h = new Date(inc.createdAt);
    const label = `${String(h.getHours()).padStart(2, "0")}:00`;
    if (buckets[label]) {
      buckets[label][inc.severity] = (buckets[label][inc.severity] ?? 0) + 1;
    }
  }

  return Object.entries(buckets).map(([hour, counts]) => ({
    hour,
    CRITICAL: counts.CRITICAL ?? 0,
    HIGH: counts.HIGH ?? 0,
    MEDIUM: counts.MEDIUM ?? 0,
    LOW: counts.LOW ?? 0,
  }));
}
