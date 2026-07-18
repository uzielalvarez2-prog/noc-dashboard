import { db } from "@/lib/db";
import { toOperatorLogin } from "@/lib/operatorLogin";

const GROUPS = ["PEXA", "CECOR"];

export async function getSLAMetrics() {
  const [total, breached, byGroupData] = await Promise.all([
    db.closedIncident.count(),
    db.closedIncident.count({ where: { slaBreached: true } }),
    Promise.all(
      GROUPS.map(async (group) => {
        const [tot, br] = await Promise.all([
          db.closedIncident.count({ where: { group } }),
          db.closedIncident.count({ where: { group, slaBreached: true } }),
        ]);
        return { group, total: tot, breached: br };
      })
    ),
  ]);

  const compliance = total > 0 ? Math.round(((total - breached) / total) * 100) : 100;

  return {
    global: { compliance, total, breached, atRisk: 0 },
    byGroup: Object.fromEntries(
      byGroupData.map(({ group, total: tot, breached: br }) => [
        group,
        {
          compliance: tot > 0 ? Math.round(((tot - br) / tot) * 100) : 100,
          total: tot,
          breached: br,
        },
      ])
    ),
  };
}

export async function getSLABreaches() {
  const rows = await db.closedIncident.findMany({
    where: { slaBreached: true },
    orderBy: [{ resolutionMins: "desc" }],
    select: {
      incidentId: true,
      group: true,
      closedBy: true,
      resCause: true,
      resolutionMins: true,
      openTime: true,
      closeTime: true,
    },
    take: 100,
  });
  return rows.map((r) => ({ ...r, closedBy: toOperatorLogin(r.closedBy) }));
}

export async function getSLATrend(): Promise<
  { day: string; compliance: number; breached: number; total: number }[]
> {
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date();
    start.setDate(start.getDate() - i);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const [tot, br] = await Promise.all([
      db.closedIncident.count({ where: { closeTime: { gte: start, lte: end } } }),
      db.closedIncident.count({
        where: { closeTime: { gte: start, lte: end }, slaBreached: true },
      }),
    ]);

    result.push({
      day: start.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit" }),
      compliance: tot > 0 ? Math.round(((tot - br) / tot) * 100) : 100,
      breached: br,
      total: tot,
    });
  }
  return result;
}
