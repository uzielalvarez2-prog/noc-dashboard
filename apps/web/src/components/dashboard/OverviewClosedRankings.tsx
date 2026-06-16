"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ClosedStats } from "@/types/closed";
import { ClosedRanking } from "@/components/closed/ClosedRanking";
import { cn } from "@/lib/utils";

type Range = "today" | "all";

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

async function fetchStats(range: Range): Promise<ClosedStats> {
  const params = new URLSearchParams();
  if (range === "today") {
    const { from, to } = todayRange();
    params.set("from", from);
    params.set("to", to);
  }
  const qs = params.toString();
  const res = await fetch(`/api/incidents/closed/stats${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Error al obtener estadística de cerrados");
  return res.json();
}

export function OverviewClosedRankings() {
  const [range, setRange] = useState<Range>("today");

  const { data: stats } = useQuery<ClosedStats>({
    queryKey: ["closed-stats-overview", range],
    queryFn: () => fetchStats(range),
    refetchInterval: 240_000,
  });

  const rangeBtn = (r: Range) =>
    cn(
      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
      range === r ? "bg-surface-elevated text-text-primary" : "text-text-muted hover:text-text-primary"
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">
          Incidentes cerrados — rankings
        </h2>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
          <button type="button" className={rangeBtn("today")} onClick={() => setRange("today")}>
            Hoy
          </button>
          <button type="button" className={rangeBtn("all")} onClick={() => setRange("all")}>
            Histórico
          </button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ClosedRanking
          title="Analistas"
          dimensionLabel="Analista"
          rows={stats?.byUser ?? []}
          fileBase="cerrados-analista-overview"
          variant="analyst"
        />
        <ClosedRanking
          title="Por Causa"
          dimensionLabel="Causa"
          rows={stats?.byCause ?? []}
          fileBase="cerrados-causa-overview"
          variant="cause"
        />
      </div>
    </div>
  );
}
