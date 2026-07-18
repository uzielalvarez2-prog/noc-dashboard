import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { toOperatorLogin } from "@/lib/operatorLogin";

export interface ClosedFilters {
  group?: string; // PEXA | CECOR | ALL
  from?: Date;
  to?: Date;
}

function buildClosedWhere(f: ClosedFilters): Prisma.ClosedIncidentWhereInput {
  const and: Prisma.ClosedIncidentWhereInput[] = [];
  if (f.group && f.group !== "ALL") and.push({ group: f.group });
  if (f.from || f.to) {
    and.push({ closeTime: { ...(f.from && { gte: f.from }), ...(f.to && { lte: f.to }) } });
  }
  return and.length ? { AND: and } : {};
}

/**
 * Estadística de cerrados: totales, SLA (4 h), cerrados por usuario (Closed By) y
 * por causa (Res Analyst Code). Se agrega en memoria para dar varias vistas de un
 * solo query — el volumen de cerrados por día es de cientos, no miles.
 */
export async function getClosedStats(f: ClosedFilters = {}) {
  const where = buildClosedWhere(f);
  const rows = await db.closedIncident.findMany({
    where,
    select: { closedBy: true, resCause: true, slaBreached: true, resolutionMins: true },
  });

  const total = rows.length;
  let evaluables = 0; // incidentes con hora de apertura y cierre (medibles para SLA)
  let vencidos = 0;
  let sumMins = 0;
  const userMap = new Map<string, number>();
  const causeMap = new Map<string, number>();

  for (const r of rows) {
    if (r.resolutionMins > 0) {
      evaluables++;
      sumMins += r.resolutionMins;
      if (r.slaBreached) vencidos++;
    }
    const u = r.closedBy ? toOperatorLogin(r.closedBy) : "(sin dato)";
    const c = r.resCause || "(sin dato)";
    userMap.set(u, (userMap.get(u) ?? 0) + 1);
    causeMap.set(c, (causeMap.get(c) ?? 0) + 1);
  }

  const cumplidos = evaluables - vencidos;
  const compliance = evaluables ? Math.round((cumplidos / evaluables) * 1000) / 10 : 0;
  const toArr = (m: Map<string, number>) =>
    [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  return {
    total,
    evaluables,
    cumplidos,
    vencidos,
    compliance,
    avgResolutionMins: evaluables ? Math.round(sumMins / evaluables) : 0,
    byUser: toArr(userMap),
    byCause: toArr(causeMap),
  };
}
