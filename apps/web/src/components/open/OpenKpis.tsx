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

export function OpenKpis({ stats, group = "ALL" }: { stats?: OpenStats; group?: string }) {
  const pexa = stats?.byGroup.find((g) => g.group === "PEXA")?.incidents ?? 0;
  const cecor = stats?.byGroup.find((g) => g.group === "CECOR")?.incidents ?? 0;

  // PEXA visible salvo en la pestaña CECOR; CECOR visible salvo en la pestaña PEXA.
  // En "Todos" se muestran ambos (engloba los dos grupos).
  const showPexa = group !== "CECOR";
  const showCecor = group !== "PEXA";
  const count = 1 + (showPexa ? 1 : 0) + (showCecor ? 1 : 0) + 2;
  const cols = count >= 5 ? "md:grid-cols-5" : "md:grid-cols-4";

  return (
    <div className={`grid grid-cols-2 gap-3 ${cols}`}>
      <Card label="Incidentes abiertos" value={stats?.totalIncidents ?? "—"} sub="únicos" />
      {showPexa && <Card label="PEXA" value={pexa} accent="text-accent" sub="incidentes" />}
      {showCecor && <Card label="CECOR" value={cecor} accent="text-warning" sub="incidentes" />}
      <Card
        label="Work In Progress"
        value={stats?.workInProgress ?? "—"}
        accent="text-accent"
        sub="en progreso"
      />
      <Card
        label="Resueltos"
        value={stats?.resolved ?? "—"}
        accent="text-success"
        sub="status resolved"
      />
    </div>
  );
}
