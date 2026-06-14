"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OpenStats } from "@/types/open";
import { OpenKpis } from "./OpenKpis";
import { TopByDimension } from "./TopByDimension";
import { OpenIncidentTable } from "./OpenIncidentTable";
import { TopCriticalTable } from "@/components/dashboard/TopCriticalTable";
import { EscalatedPanel } from "@/components/dashboard/EscalatedPanel";
import { cn } from "@/lib/utils";

type Group = "ALL" | "PEXA" | "CECOR";

async function fetchStats(group: Group, maxAgeHours?: number): Promise<OpenStats> {
  const p = new URLSearchParams();
  if (group !== "ALL") p.set("group", group);
  if (maxAgeHours) p.set("maxAgeHours", String(maxAgeHours));
  const qs = p.toString();
  const res = await fetch(`/api/incidents/open/stats${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Error al obtener estadística");
  return res.json();
}

export function OpenIncidentsView() {
  const [group, setGroup] = useState<Group>("ALL");
  // Top por Estado/Distrito: por defecto solo incidentes de la última hora.
  const [recentOnly, setRecentOnly] = useState(true);
  const maxAgeHours = recentOnly ? 1 : undefined;

  // KPIs: siempre TODO (sin filtro de antigüedad).
  const { data: stats } = useQuery<OpenStats>({
    queryKey: ["open-stats", group],
    queryFn: () => fetchStats(group),
    refetchInterval: 240_000,
  });

  // Top: respeta el filtro ≤1h / Todo (query aparte para no tocar los KPIs).
  const { data: topStats } = useQuery<OpenStats>({
    queryKey: ["open-stats", group, recentOnly ? "1h" : "all"],
    queryFn: () => fetchStats(group, maxAgeHours),
    refetchInterval: 240_000,
  });

  const groupBtn = (g: Group) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      group === g ? "bg-accent text-white" : "border border-border text-text-muted hover:text-text-primary"
    );

  const ageBtn = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
      active ? "bg-accent text-white" : "border border-border text-text-muted hover:text-text-primary"
    );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        {(["ALL", "PEXA", "CECOR"] as Group[]).map((g) => (
          <button key={g} type="button" onClick={() => setGroup(g)} className={groupBtn(g)}>
            {g === "ALL" ? "Todos" : g}
          </button>
        ))}
      </div>

      <OpenKpis stats={stats} />

      <EscalatedPanel />

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Top por Estado / Distrito</h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setRecentOnly(true)} className={ageBtn(recentOnly)}>
            Última hora (≤1h)
          </button>
          <button type="button" onClick={() => setRecentOnly(false)} className={ageBtn(!recentOnly)}>
            Todo
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TopByDimension
          title="Top por Estado"
          dimensionLabel="Estado"
          dimensionField="state"
          rows={topStats?.topByState ?? []}
          total={topStats?.stateTotal ?? 0}
          fileBase={`top-estado-${group.toLowerCase()}${recentOnly ? "-1h" : ""}`}
          group={group}
          maxAgeHours={maxAgeHours}
        />
        <TopByDimension
          title="Top por Distrito"
          dimensionLabel="Distrito"
          dimensionField="district"
          rows={topStats?.topByDistrict ?? []}
          total={topStats?.districtTotal ?? 0}
          fileBase={`top-distrito-${group.toLowerCase()}${recentOnly ? "-1h" : ""}`}
          group={group}
          maxAgeHours={maxAgeHours}
        />
      </div>

      <TopCriticalTable />

      <OpenIncidentTable group={group} />
    </div>
  );
}
