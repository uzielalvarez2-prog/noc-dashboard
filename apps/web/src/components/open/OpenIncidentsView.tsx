"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OpenStats } from "@/types/open";
import { OpenKpis } from "./OpenKpis";
import { TopByDimension } from "./TopByDimension";
import { OpenIncidentTable } from "./OpenIncidentTable";
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

      <div className="grid gap-4 lg:grid-cols-2">
        <TopByDimension
          title="Top por Estado"
          dimensionLabel="Estado"
          dimensionField="state"
          rows={stats?.topByState ?? []}
          fileBase={`top-estado-${group.toLowerCase()}`}
          group={group}
        />
        <TopByDimension
          title="Top por Distrito"
          dimensionLabel="Distrito"
          dimensionField="district"
          rows={stats?.topByDistrict ?? []}
          fileBase={`top-distrito-${group.toLowerCase()}`}
          group={group}
        />
      </div>

      <OpenIncidentTable group={group} />
    </div>
  );
}
