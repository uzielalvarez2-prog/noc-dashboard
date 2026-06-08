"use client";

import type { ClosedStats } from "@/types/closed";

function formatMins(mins: number): string {
  if (mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function complianceColor(pct: number): string {
  return pct >= 90 ? "text-success" : pct >= 70 ? "text-warning" : "text-critical";
}

function Card({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface/60 p-4 backdrop-blur-md">
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ?? "text-text-primary"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-text-muted">{sub}</p>}
    </div>
  );
}

export function ClosedKpis({ stats }: { stats?: ClosedStats }) {
  const compliance = stats?.compliance ?? 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Card label="Cerrados" value={stats?.total ?? "—"} sub={`${stats?.evaluables ?? 0} medibles`} />
      <Card
        label="Cumplimiento SLA"
        value={stats ? `${compliance}%` : "—"}
        accent={stats ? complianceColor(compliance) : undefined}
        sub="objetivo 4 h"
      />
      <Card
        label="Cumplidos / Vencidos"
        value={stats ? `${stats.cumplidos} / ${stats.vencidos}` : "—"}
        sub="dentro vs. fuera de SLA"
      />
      <Card label="Tiempo promedio" value={stats ? formatMins(stats.avgResolutionMins) : "—"} sub="resolución" />
    </div>
  );
}
