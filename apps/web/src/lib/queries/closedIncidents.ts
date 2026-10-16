import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { toOperatorLogin } from "@/lib/operatorLogin";

export interface ClosedFilters {
  group?: string; // PEXA | CECOR | ALL
  from?: Date;
  to?: Date;
  /** Granularidad del volumen temporal (byPeriod). Default: mes. */
  bucket?: "day" | "week" | "month";
}

// Clave de periodo a partir del openTime (reloj de pared en UTC, igual que el
// resto del proyecto — ver formatHpsm). day=YYYY-MM-DD, month=YYYY-MM,
// week=YYYY-Www (semana ISO aproximada, lunes como inicio).
function periodKey(d: Date, bucket: "day" | "week" | "month"): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  if (bucket === "month") return `${y}-${m}`;
  if (bucket === "day") return `${y}-${m}-${String(d.getUTCDate()).padStart(2, "0")}`;
  // week: número de semana ISO.
  const tmp = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
  const day = tmp.getUTCDay() || 7; // lunes=1 … domingo=7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day); // jueves de esa semana
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
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
  const bucket = f.bucket ?? "month";
  const rows = await db.closedIncident.findMany({
    where,
    select: {
      closedBy: true,
      resCause: true,
      slaBreached: true,
      resolutionMins: true,
      openTime: true,
    },
  });

  const total = rows.length;
  let evaluables = 0; // incidentes con hora de apertura y cierre (medibles para SLA)
  let vencidos = 0;
  let sumMins = 0;
  const resMinsList: number[] = []; // para la mediana
  const userMap = new Map<string, number>();
  const causeMap = new Map<string, number>();
  const periodMap = new Map<string, number>(); // volumen por mes/semana/día (por apertura)

  for (const r of rows) {
    if (r.resolutionMins > 0) {
      evaluables++;
      sumMins += r.resolutionMins;
      resMinsList.push(r.resolutionMins);
      if (r.slaBreached) vencidos++;
    }
    const u = r.closedBy ? toOperatorLogin(r.closedBy) : "(sin dato)";
    const c = r.resCause || "(sin dato)";
    userMap.set(u, (userMap.get(u) ?? 0) + 1);
    causeMap.set(c, (causeMap.get(c) ?? 0) + 1);
    const pk = periodKey(r.openTime, bucket);
    periodMap.set(pk, (periodMap.get(pk) ?? 0) + 1);
  }

  const cumplidos = evaluables - vencidos;
  const compliance = evaluables ? Math.round((cumplidos / evaluables) * 1000) / 10 : 0;
  const toArr = (m: Map<string, number>) =>
    [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  // Mediana de resolución (más robusta que el promedio ante outliers).
  resMinsList.sort((a, b) => a - b);
  const medianResolutionMins = resMinsList.length
    ? resMinsList[Math.floor(resMinsList.length / 2)]
    : 0;

  // byPeriod en orden cronológico ascendente (la clave YYYY-MM / YYYY-Www /
  // YYYY-MM-DD ordena lexicográficamente igual que cronológicamente).
  const byPeriod = [...periodMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    total,
    evaluables,
    cumplidos,
    vencidos,
    compliance,
    avgResolutionMins: evaluables ? Math.round(sumMins / evaluables) : 0,
    medianResolutionMins,
    bucket,
    byUser: toArr(userMap),
    byCause: toArr(causeMap),
    byPeriod,
  };
}
