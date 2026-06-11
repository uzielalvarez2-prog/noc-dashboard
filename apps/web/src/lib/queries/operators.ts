import { db } from "@/lib/db";

export async function getOperators() {
  const [openRecs, closedRecs] = await Promise.all([
    db.openIncident.findMany({
      where: { assignee: { not: null } },
      select: { assignee: true, incidentId: true, group: true },
    }),
    db.closedIncident.findMany({
      select: { closedBy: true, slaBreached: true, group: true },
    }),
  ]);

  // Agrupar abiertos por assignee
  const openMap = new Map<string, { incidents: Set<string>; groups: Set<string> }>();
  for (const r of openRecs) {
    if (!r.assignee) continue;
    let e = openMap.get(r.assignee);
    if (!e) openMap.set(r.assignee, (e = { incidents: new Set(), groups: new Set() }));
    e.incidents.add(r.incidentId);
    e.groups.add(r.group);
  }

  // Agrupar cerrados por closedBy
  const closedMap = new Map<string, { total: number; breached: number }>();
  for (const r of closedRecs) {
    let e = closedMap.get(r.closedBy);
    if (!e) closedMap.set(r.closedBy, (e = { total: 0, breached: 0 }));
    e.total++;
    if (r.slaBreached) e.breached++;
  }

  // Unir ambas fuentes
  const allNames = new Set([...openMap.keys(), ...closedMap.keys()]);

  return [...allNames]
    .map((name) => {
      const open = openMap.get(name);
      const closed = closedMap.get(name);
      const closedTotal = closed?.total ?? 0;
      const closedBreached = closed?.breached ?? 0;
      const slaCompliance =
        closedTotal > 0
          ? Math.round(((closedTotal - closedBreached) / closedTotal) * 100)
          : 100;
      return {
        name,
        openCount: open?.incidents.size ?? 0,
        closedCount: closedTotal,
        breachedCount: closedBreached,
        slaCompliance,
        groups: [...(open?.groups ?? [])],
      };
    })
    .sort((a, b) => b.openCount - a.openCount || b.closedCount - a.closedCount);
}

export type OperatorStats = Awaited<ReturnType<typeof getOperators>>[number];
