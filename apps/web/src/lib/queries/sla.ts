import { db } from "@/lib/db";
import type { Severity } from "@/types";

export async function getSLAMetrics() {
  const now = new Date();

  const [all, breached, atRisk, resolved] = await Promise.all([
    db.incident.count(),
    db.incident.count({ where: { slaBreached: true } }),
    db.incident.count({
      where: {
        slaRiskAt: { lte: now },
        slaBreached: false,
        status: { notIn: ["RESOLVED", "CLOSED"] },
      },
    }),
    db.incident.count({ where: { status: { in: ["RESOLVED", "CLOSED"] } } }),
  ]);

  const total = all;
  const compliance = total > 0 ? Math.round(((total - breached) / total) * 100) : 100;

  const severities: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const bySeverityEntries = await Promise.all(
    severities.map(async (severity) => {
      const [tot, br] = await Promise.all([
        db.incident.count({ where: { severity } }),
        db.incident.count({ where: { severity, slaBreached: true } }),
      ]);
      return [
        severity,
        {
          compliance: tot > 0 ? Math.round(((tot - br) / tot) * 100) : 100,
          total: tot,
          breached: br,
        },
      ] as const;
    })
  );

  return {
    global: { compliance, total, breached, atRisk, resolved },
    bySeverity: Object.fromEntries(bySeverityEntries) as Record<
      Severity,
      { compliance: number; total: number; breached: number }
    >,
    trend: { hour: 0, day: 0, week: 0 },
  };
}

/** Incidentes con SLA vencido para la tabla de brechas */
export async function getSLABreaches() {
  return db.incident.findMany({
    where: { slaBreached: true },
    orderBy: [{ severity: "asc" }, { slaDeadline: "asc" }],
    select: {
      id: true,
      title: true,
      severity: true,
      status: true,
      assignedTo: true,
      slaDeadline: true,
      createdAt: true,
    },
    take: 100,
  });
}

/** Tendencia de SLA: compliance por día en los últimos 7 días */
export async function getSLATrend(): Promise<{ day: string; compliance: number; breached: number; total: number }[]> {
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date();
    start.setDate(start.getDate() - i);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const [tot, br] = await Promise.all([
      db.incident.count({ where: { createdAt: { gte: start, lte: end } } }),
      db.incident.count({ where: { createdAt: { gte: start, lte: end }, slaBreached: true } }),
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
