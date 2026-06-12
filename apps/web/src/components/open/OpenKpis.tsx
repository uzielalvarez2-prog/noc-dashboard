"use client";

import type { OpenStats } from "@/types/open";

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

export function OpenKpis({ stats }: { stats?: OpenStats }) {
  const pexa = stats?.byGroup.find((g) => g.group === "PEXA")?.incidents ?? 0;
  const cecor = stats?.byGroup.find((g) => g.group === "CECOR")?.incidents ?? 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Card label="Incidentes abiertos" value={stats?.totalIncidents ?? "—"} sub="únicos" />
      <Card
        label="Sitios afectados"
        value={stats?.totalSites ?? "—"}
        sub="ubicaciones — un incidente puede abarcar varios sitios"
      />
      <Card label="PEXA" value={pexa} accent="text-accent" sub="incidentes" />
      <Card label="CECOR" value={cecor} accent="text-warning" sub="incidentes" />
    </div>
  );
}
