"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OpenStats } from "@/types/open";
import { OpenKpis } from "./OpenKpis";
import { TopByDimension } from "./TopByDimension";
import { OpenIncidentTable } from "./OpenIncidentTable";
import { TopCriticalTable } from "@/components/dashboard/TopCriticalTable";
import { EscalatedPanel } from "@/components/dashboard/EscalatedPanel";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

const POLL_MS = 240_000;

function useCountdown(dataUpdatedAt: number) {
  const [remaining, setRemaining] = useState(POLL_MS / 1000);
  useEffect(() => {
    function tick() {
      const elapsed = (Date.now() - dataUpdatedAt) / 1000;
      setRemaining(Math.max(0, Math.round(POLL_MS / 1000 - elapsed)));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);
  return remaining;
}

function formatCountdown(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

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
  const { data: stats, isFetching, refetch, dataUpdatedAt } = useQuery<OpenStats>({
    queryKey: ["open-stats", group],
    queryFn: () => fetchStats(group),
    refetchInterval: POLL_MS,
  });

  const countdown = useCountdown(dataUpdatedAt);

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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {(["ALL", "PEXA", "CECOR"] as Group[]).map((g) => (
            <button key={g} type="button" onClick={() => setGroup(g)} className={groupBtn(g)}>
              {g === "ALL" ? "Todos" : g}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-text-muted">
            {isFetching ? "Actualizando…" : `Próxima actualización en ${formatCountdown(countdown)}`}
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            title="Actualizar ahora"
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Actualizar
          </button>
        </div>
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
          title="IM-Estado"
          dimensionLabel="Estado"
          dimensionField="state"
          rows={topStats?.topByState ?? []}
          total={topStats?.stateTotal ?? 0}
          fileBase={`im-estado-${group.toLowerCase()}${recentOnly ? "-1h" : ""}`}
          group={group}
          maxAgeHours={maxAgeHours}
        />
        <TopByDimension
          title="IM-Distrito"
          dimensionLabel="Distrito"
          dimensionField="district"
          rows={topStats?.topByDistrict ?? []}
          total={topStats?.districtTotal ?? 0}
          fileBase={`im-distrito-${group.toLowerCase()}${recentOnly ? "-1h" : ""}`}
          group={group}
          maxAgeHours={maxAgeHours}
        />
      </div>

      <TopCriticalTable />

      {/* La tabla de incidentes SIEMPRE muestra todo (no se filtra por ≤1h);
          el toggle "Última hora" es exclusivo del Top por Estado/Distrito. */}
      <OpenIncidentTable group={group} />
    </div>
  );
}
