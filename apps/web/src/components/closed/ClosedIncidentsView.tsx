"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ClosedStats } from "@/types/closed";
import { ClosedKpis } from "./ClosedKpis";
import { ClosedRanking } from "./ClosedRanking";
import { cn } from "@/lib/utils";

type Group = "ALL" | "PEXA" | "CECOR";

async function fetchStats(group: Group): Promise<ClosedStats> {
  const qs = group !== "ALL" ? `?group=${group}` : "";
  const res = await fetch(`/api/incidents/closed/stats${qs}`);
  if (!res.ok) throw new Error("Error al obtener estadística");
  return res.json();
}

export function ClosedIncidentsView() {
  const [group, setGroup] = useState<Group>("ALL");

  const { data: stats } = useQuery<ClosedStats>({
    queryKey: ["closed-stats", group],
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

      <ClosedKpis stats={stats} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ClosedRanking
          title="Top por Analista"
          dimensionLabel="Analista"
          rows={stats?.byUser ?? []}
          fileBase={`cerrados-analista-${group.toLowerCase()}`}
        />
        <ClosedRanking
          title="Top por Causa"
          dimensionLabel="Causa"
          rows={stats?.byCause ?? []}
          fileBase={`cerrados-causa-${group.toLowerCase()}`}
        />
      </div>
    </div>
  );
}
