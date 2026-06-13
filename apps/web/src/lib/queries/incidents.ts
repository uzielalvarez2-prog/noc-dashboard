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
      select: {
        incidentId: true, openTime: true, status: true, group: true, assignee: true,
        company: true, serviceId: true, state: true, district: true,
      },
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

  // Los RESUELTOS siguen en la cola pero ya no requieren atención
  const isActive = (s: string) => !s.toUpperCase().includes("RESOLVED");

  const breached = incidents.filter(
    (r) => isActive(r.status) && r.openTime <= slaBreachThreshold
  );
  const atRisk = incidents.filter(
    (r) =>
      isActive(r.status) &&
      r.openTime > slaBreachThreshold &&
      r.openTime <= slaRiskThreshold
  );

  // Top 15 con MÁS tiempo abierto (los más críticos primero)
  const criticalIncidents = [...breached]
    .sort((a, b) => a.openTime.getTime() - b.openTime.getTime())
    .slice(0, 15)
    .map((r) => ({
      id: r.incidentId,
      group: r.group,
      status: r.status,
      assignedTo: r.assignee,
      company: r.company,
      serviceId: r.serviceId,
      state: r.state,
      district: r.district,
      openTime: r.openTime.toISOString(),
    }));

  return {
    totalOpen: incidents.length,
    openPexa: incidents.filter((r) => r.group === "PEXA").length,
    openCecor: incidents.filter((r) => r.group === "CECOR").length,
    criticalActive: breached.filter((r) => r.group === "PEXA").length,
    slaAtRisk: atRisk.length,
    closedToday,
    criticalIncidents,
    lastSync: uploadedAtRow?.uploadedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export interface TrendPoint {
  hour: string;
  PEXA: number;
  CECOR: number;
}

/**
 * Conteo por día de los incidentes abiertos ACTUALES (únicos, no filas por
 * sitio) según cuándo cayeron — solo días con datos, hasta 30 días atrás.
 */
export async function getOpenByDay(): Promise<{ day: string; total: number }[]> {
  const since = new Date();
  since.setDate(since.getDate() - 29);
  since.setHours(0, 0, 0, 0);

  const rows = await db.openIncident.findMany({
    where: { openTime: { gte: since } },
    select: { incidentId: true, openTime: true },
  });

  // Un incidente abarca varios sitios (filas); usar su primer openTime
  const firstOpen = new Map<string, Date>();
  for (const r of rows) {
    const prev = firstOpen.get(r.incidentId);
    if (!prev || r.openTime < prev) firstOpen.set(r.incidentId, r.openTime);
  }

  const counts = new Map<string, number>();
  for (const t of firstOpen.values()) {
    const key = t.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(12, 0, 0, 0);
    const total = counts.get(d.toISOString().slice(0, 10)) ?? 0;
    if (total > 0) {
      result.push({
        day: d.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit" }),
        total,
      });
    }
  }
  return result;
}

/** Conteos por hora (incidentes únicos) en las últimas 24h — PEXA vs CECOR. */
export async function getIncidentTrend(): Promise<TrendPoint[]> {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 3600000);

  const rows = await db.openIncident.findMany({
    where: { openTime: { gte: since } },
    select: { incidentId: true, openTime: true, group: true },
  });

  // Deduplicar: un incidente abarca varios sitios (filas)
  const uniq = new Map<string, { openTime: Date; group: string }>();
  for (const r of rows) {
    const prev = uniq.get(r.incidentId);
    if (!prev || r.openTime < prev.openTime)
      uniq.set(r.incidentId, { openTime: r.openTime, group: r.group });
  }

  const buckets: Record<string, { PEXA: number; CECOR: number }> = {};
  for (let i = 0; i < 24; i++) {
    const h = new Date(since.getTime() + i * 3600000);
    const label = `${String(h.getHours()).padStart(2, "0")}:00`;
    buckets[label] = { PEXA: 0, CECOR: 0 };
  }

  for (const inc of uniq.values()) {
    const h = new Date(inc.openTime);
    const label = `${String(h.getHours()).padStart(2, "0")}:00`;
    if (buckets[label]) {
      if (inc.group === "CECOR") buckets[label].CECOR++;
      else buckets[label].PEXA++;
    }
  }

  return Object.entries(buckets).map(([hour, counts]) => ({
    hour,
    PEXA: counts.PEXA,
    CECOR: counts.CECOR,
  }));
}
