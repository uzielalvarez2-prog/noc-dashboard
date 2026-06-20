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

  // "Todos" engloba ambos grupos → PEXA + CECOR (sin desglose por estatus).
  // En una pestaña de grupo (PEXA/CECOR) "Incidentes abiertos" ya ES ese total,
  // así que en vez de repetir la tarjeta del grupo, mostramos WIP + Resueltos.
  const showGroups = group === "ALL";
  const showStatus = group !== "ALL";
  const count = 1 + (showGroups ? 2 : 0) + (showStatus ? 2 : 0);
  const cols =
    count >= 5 ? "md:grid-cols-5" : count === 4 ? "md:grid-cols-4" : "md:grid-cols-3";

  return (
    <div className={`grid grid-cols-2 gap-3 ${cols}`}>
      <Card label="Incidentes abiertos" value={stats?.totalIncidents ?? "—"} sub="únicos" />
      {showGroups && <Card label="PEXA" value={pexa} accent="text-accent" sub="incidentes" />}
      {showGroups && <Card label="CECOR" value={cecor} accent="text-warning" sub="incidentes" />}
      {showStatus && (
        <Card
          label="Work In Progress"
          value={stats?.workInProgress ?? "—"}
          accent="text-accent"
          sub="en progreso"
        />
      )}
      {showStatus && (
        <Card
          label="Resueltos"
          value={stats?.resolved ?? "—"}
          accent="text-success"
          sub="status resolved"
        />
      )}
    </div>
  );
}
