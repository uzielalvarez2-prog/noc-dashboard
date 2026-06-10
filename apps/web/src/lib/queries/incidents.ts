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

export async function getKPIs() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalOpen,
    criticalActive,
    slaAtRisk,
    closedToday,
    criticalIncidents,
    lastSync,
  ] = await Promise.all([
    db.incident.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    db.incident.count({
      where: { severity: "CRITICAL", status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    db.incident.count({
      where: {
        slaRiskAt: { lte: now },
        slaBreached: false,
        status: { notIn: ["RESOLVED", "CLOSED"] },
      },
    }),
    db.incident.count({
      where: {
        status: { in: ["RESOLVED", "CLOSED"] },
        updatedAt: { gte: todayStart },
      },
    }),
    db.incident.findMany({
      where: { slaBreached: true, status: { notIn: ["RESOLVED", "CLOSED"] } },
      orderBy: { slaDeadline: "asc" },
      take: 10,
      select: {
        id: true,
        title: true,
        severity: true,
        status: true,
        assignedTo: true,
        slaDeadline: true,
        slaBreached: true,
        createdAt: true,
      },
    }),
    db.incident
      .findFirst({ orderBy: { syncedAt: "desc" } })
      .then((r) => r?.syncedAt?.toISOString() ?? new Date().toISOString()),
  ]);

  return {
    totalOpen,
    criticalActive,
    slaAtRisk,
    closedToday,
    criticalIncidents,
    lastSync,
  };
}

export interface TrendPoint {
  hour: string;
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
}

/** Devuelve conteos de incidentes abiertos agrupados por dia (ultimos 7 dias). */
export async function getOpenByDay(): Promise<{ day: string; total: number; breached: number }[]> {
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date();
    start.setDate(start.getDate() - i);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const [total, breached] = await Promise.all([
      db.incident.count({ where: { createdAt: { gte: start, lte: end } } }),
      db.incident.count({ where: { createdAt: { gte: start, lte: end }, slaBreached: true } }),
    ]);

    result.push({
      day: start.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit" }),
      total,
      breached,
    });
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
