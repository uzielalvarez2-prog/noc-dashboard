import { db } from "@/lib/db";

export async function getOperators() {
  const operators = await db.operator.findMany({
    orderBy: [{ isOnShift: "desc" }, { name: "asc" }],
  });

  const withMetrics = await Promise.all(
    operators.map(async (op) => {
      const [assigned, resolved, breached] = await Promise.all([
        db.incident.count({
          where: { assignedTo: op.id, status: { notIn: ["RESOLVED", "CLOSED"] } },
        }),
        db.incident.count({
          where: { assignedTo: op.id, status: { in: ["RESOLVED", "CLOSED"] } },
        }),
        db.incident.count({
          where: { assignedTo: op.id, slaBreached: true },
        }),
      ]);

      const total = assigned + resolved;
      const slaCompliance = total > 0 ? Math.round(((total - breached) / total) * 100) : 100;

      return {
        ...op,
        assignedCount: assigned,
        resolvedCount: resolved,
        breachedCount: breached,
        slaCompliance,
      };
    })
  );

  return withMetrics;
}

export type OperatorWithMetrics = Awaited<ReturnType<typeof getOperators>>[number];
