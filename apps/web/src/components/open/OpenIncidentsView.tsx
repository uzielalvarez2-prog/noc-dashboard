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

async function fetchStats(group: Group): Promise<OpenStats> {
  const qs = group !== "ALL" ? `?group=${group}` : "";
  const res = await fetch(`/api/incidents/open/stats${qs}`);
  if (!res.ok) throw new Error("Error al obtener estadística");
  return res.json();
}

export function OpenIncidentsView() {
  const [group, setGroup] = useState<Group>("ALL");

  const { data: stats } = useQuery<OpenStats>({
    queryKey: ["open-stats", group],
    queryFn: () => fetchStats(group),
    refetchInterval: 240_000,
  });

  // El Top por Estado/Distrito es SIEMPRE de PEXA (CECOR tiene su propia vista).
  // No depende del botón Todos/PEXA/CECOR.
  const { data: pexaStats } = useQuery<OpenStats>({
    queryKey: ["open-stats", "PEXA"],
    queryFn: () => fetchStats("PEXA"),
    refetchInterval: 240_000,
  });

  const groupBtn = (g: Group) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      group === g ? "bg-accent text-white" : "border border-border text-text-muted hover:text-text-primary"
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

      <div className="grid gap-4 lg:grid-cols-2">
        <TopByDimension
          title="Top por Estado (PEXA)"
          dimensionLabel="Estado"
          dimensionField="state"
          rows={pexaStats?.topByState ?? []}
          total={pexaStats?.stateTotal ?? 0}
          fileBase="top-estado-pexa"
          group="PEXA"
        />
        <TopByDimension
          title="Top por Distrito (PEXA)"
          dimensionLabel="Distrito"
          dimensionField="district"
          rows={pexaStats?.topByDistrict ?? []}
          total={pexaStats?.districtTotal ?? 0}
          fileBase="top-distrito-pexa"
          group="PEXA"
        />
      </div>

      <TopCriticalTable />

      <OpenIncidentTable group={group} />
    </div>
  );
}
