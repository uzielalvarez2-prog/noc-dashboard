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
  // Solo la vista "Todos" muestra el resumen total + desglose PEXA/CECOR. En las
  // pestañas de grupo (PEXA/CECOR) el total se muestra como primera tarjeta de la
  // sección "Por estatus" (StatusBreakdown), para no ocupar todo el ancho.
  if (group !== "ALL") return null;

  const pexa = stats?.byGroup.find((g) => g.group === "PEXA")?.incidents ?? 0;
  const cecor = stats?.byGroup.find((g) => g.group === "CECOR")?.incidents ?? 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <Card label="Incidentes abiertos" value={stats?.totalIncidents ?? "—"} sub="únicos" />
      <Card label="PEXA" value={pexa} accent="text-accent" sub="incidentes" />
      <Card label="CECOR" value={cecor} accent="text-warning" sub="incidentes" />
    </div>
  );
}
