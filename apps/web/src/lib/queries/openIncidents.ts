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
}

/** Arma el filtro Prisma. El buscador `q` abarca todas las columnas visibles. */
export function buildOpenWhere(f: OpenFilters): Prisma.OpenIncidentWhereInput {
  const and: Prisma.OpenIncidentWhereInput[] = [];
  if (f.group && f.group !== "ALL") and.push({ group: f.group });
  if (f.state) and.push({ state: { equals: f.state, mode: "insensitive" } });
  if (f.district) and.push({ district: { equals: f.district, mode: "insensitive" } });
  if (f.assignee) and.push({ assignee: { contains: f.assignee, mode: "insensitive" } });
  if (f.status) and.push({ status: { contains: f.status, mode: "insensitive" } });
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

/** Lista paginada a nivel incidente×sitio + total de filas e incidentes únicos. */
export async function getOpenIncidents(f: OpenFilters) {
  const page = Math.max(1, f.page ?? 1);
  const limit = Math.min(200, Math.max(1, f.limit ?? 50));
  const where = buildOpenWhere(f);

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
    data: rows,
    meta: {
      total,
      uniqueIncidents: distinctIds.length,
      page,
      limit,
      lastSync: rows[0]?.uploadedAt ?? null,
    },
  };
}

interface TopRow {
  name: string;
  sites: number;
  incidents: number;
}

function topFrom(map: Map<string, { sites: number; ids: Set<string> }>): TopRow[] {
  return [...map.entries()]
    .map(([name, v]) => ({ name: name || "(sin dato)", sites: v.sites, incidents: v.ids.size }))
    .sort((a, b) => b.sites - a.sites);
}

/**
 * KPIs y rankings para la sección de abiertos. Trae solo las columnas mínimas y
 * agrega en memoria (≈1k filas) para entregar de un jalón "sitios afectados" y
 * "incidentes únicos" por estado y por distrito (falla masiva).
 */
export async function getOpenStats(group?: string) {
  const where: Prisma.OpenIncidentWhereInput = group && group !== "ALL" ? { group } : {};
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
  };
}
