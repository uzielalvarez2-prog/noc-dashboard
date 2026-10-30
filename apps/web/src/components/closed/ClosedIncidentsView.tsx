"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ClosedStats } from "@/types/closed";
import { ClosedKpis } from "./ClosedKpis";
import { ClosedRankingDonut } from "./ClosedRankingDonut";
import { cn } from "@/lib/utils";

type Group = "ALL" | "PEXA" | "CECOR";
// "today" | "all" | "YYYY-MM" (un mes concreto del año en curso)
type DateRange = string;

const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Meses disponibles en el selector: de enero al mes en curso del año actual,
// en orden descendente (el más reciente primero).
function availableMonths(): { value: string; label: string }[] {
  const now = new Date();
  const year = now.getFullYear();
  const out: { value: string; label: string }[] = [];
  for (let m = now.getMonth(); m >= 0; m--) {
    out.push({ value: `${year}-${String(m + 1).padStart(2, "0")}`, label: MONTH_LABELS[m] });
  }
  return out;
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

// Rango [primer día 00:00, último día 23:59:59] del mes "YYYY-MM" en hora local.
function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

function isMonthRange(range: DateRange): boolean {
  return /^\d{4}-\d{2}$/.test(range);
}

async function fetchStats(group: Group, range: DateRange): Promise<ClosedStats> {
  const params = new URLSearchParams();
  if (group !== "ALL") params.set("group", group);
  if (range === "today") {
    const { from, to } = todayRange();
    params.set("from", from);
    params.set("to", to);
  } else if (isMonthRange(range)) {
    const { from, to } = monthRange(range);
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

  const months = availableMonths();
  const monthActive = isMonthRange(range);

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
          <select
            value={monthActive ? range : ""}
            onChange={(e) => e.target.value && setRange(e.target.value)}
            className={cn(
              "rounded-md bg-transparent px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none",
              monthActive
                ? "bg-surface-elevated text-text-primary"
                : "text-text-muted hover:text-text-primary"
            )}
          >
            <option value="" disabled>
              Mes…
            </option>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ClosedKpis stats={stats} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ClosedRankingDonut
          title="Analistas"
          dimensionLabel="Analista"
          rows={stats?.byUser ?? []}
          fileBase={`cerrados-analista-${group.toLowerCase()}`}
          limit={15}
        />
        <ClosedRankingDonut
          title="Incidentes cerrados por Código"
          dimensionLabel="Causa"
          rows={stats?.byCause ?? []}
          fileBase={`cerrados-causa-${group.toLowerCase()}`}
          limit={12}
        />
      </div>
    </div>
  );
}
