import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export interface OpenFilters {
  q?: string;
  group?: string; // PEXA | CECOR | ALL
  state?: string;
  district?: string;
  assignee?: string;
  status?: string;
  page?: number;
  limit?: number;
  /** false = filas a nivel sitio (detalle). default true = 1 fila por incidente. */
  collapse?: boolean;
  /** Solo incidentes con antigüedad <= N horas (openTime >= ahora - N). */
  maxAgeHours?: number;
}

/**
 * "Ahora" en la MISMA escala que `openTime` de HPSM. Las fechas HPSM se guardan
 * como reloj de pared de México pero etiquetadas como UTC (ver parseHpsmDate),
 * así que para medir antigüedad tomamos la hora de pared de México actual y la
 * reinterpretamos como UTC. Robusto a cualquier offset/DST (no hardcodea -6h).
 * Sin esto, comparar contra Date.now() (UTC real) recorre el corte ~6h y el
 * filtro "última hora" deja las tablas vacías.
 */
function hpsmNow(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date());
  const p = (t: string) => Number(parts.find((x) => x.type === t)!.value);
  return new Date(
    Date.UTC(p("year"), p("month") - 1, p("day"), p("hour"), p("minute"), p("second")),
  );
}

/** Corte de antigüedad (openTime >= ahora - maxAgeHours) en la escala de HPSM. */
function hpsmCutoff(maxAgeHours: number): Date {
  return new Date(hpsmNow().getTime() - maxAgeHours * 3_600_000);
}

/** Arma el filtro Prisma. El buscador `q` abarca todas las columnas visibles. */
export function buildOpenWhere(f: OpenFilters): Prisma.OpenIncidentWhereInput {
  const and: Prisma.OpenIncidentWhereInput[] = [];
  if (f.group && f.group !== "ALL") and.push({ group: f.group });
  if (f.state) and.push({ state: { equals: f.state, mode: "insensitive" } });
  if (f.district) and.push({ district: { equals: f.district, mode: "insensitive" } });
  if (f.assignee) and.push({ assignee: { contains: f.assignee, mode: "insensitive" } });
  if (f.status) and.push({ status: { contains: f.status, mode: "insensitive" } });
  if (f.maxAgeHours && f.maxAgeHours > 0) {
    and.push({ openTime: { gte: hpsmCutoff(f.maxAgeHours) } });
  }
  // `collapse` no es columna; no se agrega al where.
  if (f.q?.trim()) {
    const q = f.q.trim();
    and.push({
      OR: [
        { incidentId: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
        { serviceId: { contains: q, mode: "insensitive" } },
        { state: { contains: q, mode: "insensitive" } },
        { district: { contains: q, mode: "insensitive" } },
        { assignee: { contains: q, mode: "insensitive" } },
        { status: { contains: q, mode: "insensitive" } },
        { group: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

/**
 * Lista de incidentes abiertos.
 * - Por defecto colapsa a 1 fila por incidente (un IM puede abarcar varios
 *   sitios); agrega `siteCount` y muestra "Varios (N)" en estado/distrito cuando
 *   el incidente toca más de uno. La paginación es a nivel incidente.
 * - Con `collapse:false` devuelve las filas a nivel sitio (para el detalle/exporte
 *   de Top por estado/distrito).
 */
export async function getOpenIncidents(f: OpenFilters) {
  const page = Math.max(1, f.page ?? 1);
  const where = buildOpenWhere(f);

  if (f.collapse === false) {
    const limit = Math.min(500, Math.max(1, f.limit ?? 50));
    const [rows, total, distinctIds] = await Promise.all([
      db.openIncident.findMany({
        where,
        orderBy: [{ openTime: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.openIncident.count({ where }),
      db.openIncident.findMany({ where, select: { incidentId: true }, distinct: ["incidentId"] }),
    ]);
    return {
      data: rows.map((r) => ({ ...r, siteCount: 1 })),
      meta: {
        total,
        totalSites: total,
        uniqueIncidents: distinctIds.length,
        page,
        limit,
        lastSync: rows[0]?.uploadedAt ?? null,
      },
    };
  }

  const limit = Math.min(200, Math.max(1, f.limit ?? 50));
  // Dataset acotado (~2.5k filas máx): traemos y colapsamos en memoria.
  const all = await db.openIncident.findMany({ where, orderBy: [{ openTime: "desc" }] });

  const byIncident = new Map<
    string,
    (typeof all)[number] & { siteCount: number; _states: Set<string>; _districts: Set<string> }
  >();
  for (const r of all) {
    const agg = byIncident.get(r.incidentId);
    if (!agg) {
      byIncident.set(r.incidentId, {
        ...r,
        siteCount: 1,
        _states: new Set([r.state]),
        _districts: new Set([r.district]),
      });
    } else {
      agg.siteCount++;
      agg._states.add(r.state);
      agg._districts.add(r.district);
    }
  }

  const incidents = [...byIncident.values()].map((a) => ({
    id: a.id,
    incidentId: a.incidentId,
    openTime: a.openTime,
    status: a.status,
    company: a.company,
    serviceId: a.serviceId,
    state: a._states.size > 1 ? `Varios (${a._states.size})` : a.state,
    district: a._districts.size > 1 ? `Varios (${a._districts.size})` : a.district,
    assignee: a.assignee,
    group: a.group,
    uploadedAt: a.uploadedAt,
    siteCount: a.siteCount,
  }));

  const pageRows = incidents.slice((page - 1) * limit, page * limit);

  return {
    data: pageRows,
    meta: {
      total: incidents.length,
      totalSites: all.length,
      uniqueIncidents: incidents.length,
      page,
      limit,
      lastSync: all[0]?.uploadedAt ?? null,
    },
  };
}

interface TopRow {
  name: string;
  sites: number;
  incidents: number;
}

// TOP 10 de zonas con más incidentes, descendente (requerimiento del usuario:
// un ranking por Site Name State y otro por Site Name District).
function topFrom(map: Map<string, { sites: number; ids: Set<string> }>): TopRow[] {
  return [...map.entries()]
    .map(([name, v]) => ({ name: name || "(sin dato)", sites: v.sites, incidents: v.ids.size }))
    .sort((a, b) => b.incidents - a.incidents);
}

/** Suma de incidentes (1 por incidente) sobre TODAS las entradas de la dimensión. */
function colTotal(map: Map<string, { sites: number; ids: Set<string> }>): number {
  return [...map.values()].reduce((s, v) => s + v.ids.size, 0);
}

/**
 * KPIs y rankings para la sección de abiertos. Trae solo las columnas mínimas y
 * agrega en memoria (≈1k filas) para entregar de un jalón "sitios afectados" y
 * "incidentes únicos" por estado y por distrito (falla masiva).
 */
export async function getOpenStats(group?: string, maxAgeHours?: number) {
  const where: Prisma.OpenIncidentWhereInput = group && group !== "ALL" ? { group } : {};
  if (maxAgeHours && maxAgeHours > 0) {
    where.openTime = { gte: hpsmCutoff(maxAgeHours) };
  }
  const rows = await db.openIncident.findMany({
    where,
    select: { incidentId: true, state: true, district: true, group: true },
  });

  const stateMap = new Map<string, { sites: number; ids: Set<string> }>();
  const distMap = new Map<string, { sites: number; ids: Set<string> }>();
  const groupIds = new Map<string, Set<string>>();
  const allIds = new Set<string>();

  for (const r of rows) {
    allIds.add(r.incidentId);

    let g = groupIds.get(r.group);
    if (!g) groupIds.set(r.group, (g = new Set()));
    g.add(r.incidentId);

    let s = stateMap.get(r.state);
    if (!s) stateMap.set(r.state, (s = { sites: 0, ids: new Set() }));
    s.sites++;
    s.ids.add(r.incidentId);

    let d = distMap.get(r.district);
    if (!d) distMap.set(r.district, (d = { sites: 0, ids: new Set() }));
    d.sites++;
    d.ids.add(r.incidentId);
  }

  return {
    totalSites: rows.length,
    totalIncidents: allIds.size,
    byGroup: [...groupIds.entries()]
      .map(([g, ids]) => ({ group: g, incidents: ids.size }))
      .sort((a, b) => b.incidents - a.incidents),
    topByState: topFrom(stateMap),
    topByDistrict: topFrom(distMap),
    // Total de incidentes contado por cada columna (todas las entradas, no solo el top).
    stateTotal: colTotal(stateMap),
    districtTotal: colTotal(distMap),
  };
}
