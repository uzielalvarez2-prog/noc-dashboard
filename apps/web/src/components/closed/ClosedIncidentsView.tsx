"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ClosedStats } from "@/types/closed";
import { ClosedKpis } from "./ClosedKpis";
import { ClosedRanking } from "./ClosedRanking";
import { cn } from "@/lib/utils";

type Group = "ALL" | "PEXA" | "CECOR";
type DateRange = "today" | "all";

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

async function fetchStats(group: Group, range: DateRange): Promise<ClosedStats> {
  const params = new URLSearchParams();
  if (group !== "ALL") params.set("group", group);
  if (range === "today") {
    const { from, to } = todayRange();
    params.set("from", from);
    params.set("to", to);
  }
  const qs = params.toString();
  const res = await fetch(`/api/incidents/closed/stats${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Error al obtener estadística");
  return res.json();
}

export function ClosedIncidentsView() {
  const [group, setGroup] = useState<Group>("ALL");
  const [range, setRange] = useState<DateRange>("today");

  const { data: stats } = useQuery<ClosedStats>({
    queryKey: ["closed-stats", group, range],
    queryFn: () => fetchStats(group, range),
    refetchInterval: 240_000,
  });

  const groupBtn = (g: Group) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      group === g ? "bg-accent text-white" : "border border-border text-text-muted hover:text-text-primary"
    );

  const rangeBtn = (r: DateRange) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      range === r ? "bg-surface-elevated text-text-primary" : "text-text-muted hover:text-text-primary"
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Filtro de grupo */}
        <div className="flex items-center gap-2">
          {(["ALL", "PEXA", "CECOR"] as Group[]).map((g) => (
            <button key={g} type="button" onClick={() => setGroup(g)} className={groupBtn(g)}>
              {g === "ALL" ? "Todos" : g}
            </button>
          ))}
        </div>

        {/* Filtro de fecha */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
          <button type="button" className={rangeBtn("today")} onClick={() => setRange("today")}>
            Hoy
          </button>
          <button type="button" className={rangeBtn("all")} onClick={() => setRange("all")}>
            Histórico
          </button>
        </div>
      </div>

      <ClosedKpis stats={stats} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ClosedRanking
          title="Top por Analista"
          dimensionLabel="Analista"
          rows={stats?.byUser ?? []}
          fileBase={`cerrados-analista-${group.toLowerCase()}`}
          variant="analyst"
        />
        <ClosedRanking
          title="Top por Causa"
          dimensionLabel="Causa"
          rows={stats?.byCause ?? []}
          fileBase={`cerrados-causa-${group.toLowerCase()}`}
          variant="cause"
        />
      </div>
    </div>
  );
}
