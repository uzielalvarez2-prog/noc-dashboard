import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { toOperatorLogin, isBotOperator } from "@/lib/operatorLogin";

export interface MonthlyIncidentPoint {
  month: string; // "YYYY-MM"
  label: string; // "Ene", "Feb", ...
  total: number;
  changePct: number | null; // % vs mes anterior; null si no hay mes anterior o el anterior es 0
  isPartial: boolean; // true solo en el mes en curso
  projectedTotal: number | null; // proyección a mes completo; solo en el mes en curso
  trend: number | null; // media móvil de 3 meses (usa projectedTotal del mes parcial); null si aún no hay 3 meses
}

export interface ClosedFilters {
  group?: string; // PEXA | CECOR | ALL
  from?: Date;
  to?: Date;
  /** Granularidad del volumen temporal (byPeriod). Default: mes. */
  bucket?: "day" | "week" | "month";
  /**
   * Si es true, cuenta solo cierres dentro de la jornada 07:00–22:00 (por hora
   * de CIERRE, en UTC). Lo usa el detalle de un día del histórico diario para
   * que sus KPIs/donas cuadren con el total de la tabla "Por día".
   */
  jornada?: boolean;
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

// Jornada 07:00–22:00 (minutos del día, en UTC). Se usa tanto en el detalle de
// un día (getClosedStats con jornada:true) como en la serie diaria (getClosedByDay).
const JORNADA_START_MIN = 7 * 60; // 07:00
const JORNADA_END_MIN = 22 * 60; // 22:00 (inclusive al minuto)

/** Minuto del día (0–1439) en UTC. */
function utcMinuteOfDay(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** ¿El cierre cae dentro de la jornada 07:00–22:00? */
function enJornada(closeTime: Date): boolean {
  const min = utcMinuteOfDay(closeTime);
  return min >= JORNADA_START_MIN && min <= JORNADA_END_MIN;
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
      requestedBy: true,
      resCause: true,
      slaBreached: true,
      resolutionMins: true,
      openTime: true,
      closeTime: true,
    },
  });

  let total = 0; // filas contadas (todas, o solo las de jornada si f.jornada)
  let evaluables = 0; // incidentes con hora de apertura y cierre (medibles para SLA)
  let vencidos = 0;
  let sumMins = 0;
  const resMinsList: number[] = []; // para la mediana
  const userMap = new Map<string, number>();
  const requesterMap = new Map<string, number>(); // quién ABRE (Requested By, ya login)
  const causeMap = new Map<string, number>();
  const periodMap = new Map<string, number>(); // volumen por mes/semana/día (por apertura)

  for (const r of rows) {
    // Detalle de un día: recorta a la jornada 07:00–22:00 para cuadrar con la tabla.
    if (f.jornada && !enJornada(r.closeTime)) continue;
    total++;
    if (r.resolutionMins > 0) {
      evaluables++;
      sumMins += r.resolutionMins;
      resMinsList.push(r.resolutionMins);
      if (r.slaBreached) vencidos++;
    }
    const u = r.closedBy ? toOperatorLogin(r.closedBy) : "(sin dato)";
    // requestedBy ya viene como login en el CSV ("mflopez"): no se convierte.
    const req = r.requestedBy?.trim() || "(sin dato)";
    const c = r.resCause || "(sin dato)";
    // El ranking de analistas es de humanos: el bot smBotCARE se excluye.
    if (!isBotOperator(u)) userMap.set(u, (userMap.get(u) ?? 0) + 1);
    requesterMap.set(req, (requesterMap.get(req) ?? 0) + 1);
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
    byRequester: toArr(requesterMap),
    byCause: toArr(causeMap),
    byPeriod,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTÓRICO POR DÍA (cierres de PEXA, por hora de CIERRE, jornada 07:00–22:00).
//
// Arranca el 13-nov-2026: antes de esa fecha los días no son comparables (el
// scraper cambió su ventana de descarga el 28-oct, y el 12-nov quedó incompleto
// porque falló el cierre de la noche). El histórico mensual sigue usando TODO el
// rango; esto es la vista diaria de productividad, que sí exige días homogéneos.
//
// Todo el cálculo es en UTC porque closeTime guarda el reloj de pared de HPSM
// como UTC (ver parseHpsmDate). Usar la zona del servidor recorrería el día.
// ─────────────────────────────────────────────────────────────────────────────
export const CLOSED_DAILY_START = "2026-11-13"; // primer día del histórico diario

export interface ClosedDayPoint {
  day: string; // "YYYY-MM-DD"
  total: number;
  evaluables: number;
  cumplidos: number;
  vencidos: number;
  compliance: number; // % dentro de SLA 4h
  avgResolutionMins: number;
  topUser: string | null; // analista con más cierres ese día (humano)
  topUserCount: number;
}

/** Día en UTC a partir de un Date guardado como reloj de pared. */
function utcDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Serie diaria de cierres de un grupo (default PEXA) desde CLOSED_DAILY_START,
 * contando cada incidente en el día en que se CERRÓ y solo si cerró dentro de la
 * jornada 07:00–22:00. Un día sin cierres en ese rango no aparece en la serie.
 */
export async function getClosedByDay(group: string = "PEXA"): Promise<ClosedDayPoint[]> {
  const start = new Date(`${CLOSED_DAILY_START}T00:00:00.000Z`);
  const rows = await db.closedIncident.findMany({
    where: { group, closeTime: { gte: start } },
    select: {
      closeTime: true,
      closedBy: true,
      slaBreached: true,
      resolutionMins: true,
    },
  });

  interface Acc {
    total: number;
    evaluables: number;
    vencidos: number;
    sumMins: number;
    users: Map<string, number>;
  }
  const byDay = new Map<string, Acc>();

  for (const r of rows) {
    // Solo cierres dentro de la jornada 07:00–22:00.
    if (!enJornada(r.closeTime)) continue;
    const key = utcDayKey(r.closeTime);
    let acc = byDay.get(key);
    if (!acc) {
      acc = { total: 0, evaluables: 0, vencidos: 0, sumMins: 0, users: new Map() };
      byDay.set(key, acc);
    }
    acc.total++;
    if (r.resolutionMins > 0) {
      acc.evaluables++;
      acc.sumMins += r.resolutionMins;
      if (r.slaBreached) acc.vencidos++;
    }
    const u = r.closedBy ? toOperatorLogin(r.closedBy) : "(sin dato)";
    if (!isBotOperator(u)) acc.users.set(u, (acc.users.get(u) ?? 0) + 1);
  }

  const out: ClosedDayPoint[] = [];
  for (const [day, acc] of byDay) {
    const cumplidos = acc.evaluables - acc.vencidos;
    let topUser: string | null = null;
    let topUserCount = 0;
    for (const [u, n] of acc.users) {
      if (n > topUserCount) {
        topUser = u;
        topUserCount = n;
      }
    }
    out.push({
      day,
      total: acc.total,
      evaluables: acc.evaluables,
      cumplidos,
      vencidos: acc.vencidos,
      compliance: acc.evaluables ? Math.round((cumplidos / acc.evaluables) * 1000) / 10 : 0,
      avgResolutionMins: acc.evaluables ? Math.round(acc.sumMins / acc.evaluables) : 0,
      topUser,
      topUserCount,
    });
  }
  // Más reciente primero (la clave YYYY-MM-DD ordena cronológicamente).
  out.sort((a, b) => b.day.localeCompare(a.day));
  return out;
}

const MONTH_LABELS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

/**
 * Incidentes por mes para un grupo (default PEXA), desde enero del año actual.
 * Combina ClosedIncident (histórico, por openTime) con OpenIncident (los que
 * siguen abiertos) para que el mes en curso no quede subcontado. El mes en
 * curso además trae una proyección lineal a mes completo según el ritmo diario
 * observado — útil porque comparar un mes parcial contra meses cerrados es
 * injusto.
 */
export async function getMonthlyIncidentTrend(
  group: string = "PEXA"
): Promise<MonthlyIncidentPoint[]> {
  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const [closedRows, openRows] = await Promise.all([
    db.closedIncident.findMany({
      where: { group, openTime: { gte: yearStart } },
      select: { openTime: true },
    }),
    db.openIncident.findMany({
      where: { group, openTime: { gte: yearStart } },
      select: { incidentId: true, openTime: true },
    }),
  ]);

  // Los abiertos pueden tener varias filas (una por sitio); contar el incidente una vez.
  const openUniq = new Map<string, Date>();
  for (const r of openRows) {
    const prev = openUniq.get(r.incidentId);
    if (!prev || r.openTime < prev) openUniq.set(r.incidentId, r.openTime);
  }

  const monthMap = new Map<string, number>();
  for (const { openTime } of closedRows) {
    const key = periodKey(openTime, "month");
    monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
  }
  for (const openTime of openUniq.values()) {
    const key = periodKey(openTime, "month");
    monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
  }

  const currentMonthKey = periodKey(now, "month");
  const dayOfMonth = now.getUTCDate();
  const daysInCurrentMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
  ).getUTCDate();

  const points: MonthlyIncidentPoint[] = [];
  let prevTotal: number | null = null;
  for (let m = 0; m <= now.getUTCMonth(); m++) {
    const key = `${now.getUTCFullYear()}-${String(m + 1).padStart(2, "0")}`;
    const total = monthMap.get(key) ?? 0;
    const isPartial = key === currentMonthKey;
    const changePct =
      prevTotal && prevTotal > 0 && !isPartial
        ? Math.round(((total - prevTotal) / prevTotal) * 1000) / 10
        : null;
    const projectedTotal = isPartial && dayOfMonth > 0
      ? Math.round((total / dayOfMonth) * daysInCurrentMonth)
      : null;

    points.push({
      month: key,
      label: MONTH_LABELS[m],
      total,
      changePct,
      isPartial,
      projectedTotal,
      trend: null,
    });
    prevTotal = total;
  }

  // Media móvil de 3 meses, calculada sobre el total (o la proyección si el
  // mes es parcial) para que la tendencia no se desplome artificialmente por
  // un mes que todavía no termina.
  const series = points.map((p) => p.projectedTotal ?? p.total);
  for (let i = 0; i < points.length; i++) {
    if (i < 2) continue;
    const window = series.slice(i - 2, i + 1);
    points[i].trend = Math.round(window.reduce((s, v) => s + v, 0) / window.length);
  }

  return points;
}
