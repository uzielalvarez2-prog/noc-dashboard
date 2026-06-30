"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OpenStats } from "@/types/open";
import { OpenKpis } from "./OpenKpis";
import { StatusBreakdown } from "./StatusBreakdown";
import { TopByDimension } from "./TopByDimension";
import { OpenIncidentTable } from "./OpenIncidentTable";
import { EscalatedPanel } from "@/components/dashboard/EscalatedPanel";
import { CriticosDownView } from "@/components/warroom/CriticosDownView";
import { ContratoMarcoDownView } from "@/components/warroom/ContratoMarcoDownView";
import type { SortDir } from "@/lib/exportOpenIncidents";
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

type Group = "PEXA" | "CECOR" | "EDC" | "WSP" | "CM";

const GROUP_LABELS: Record<Group, string> = {
  PEXA: "PEXA",
  CECOR: "CECOR",
  EDC: "EDC",
  WSP: "WSP. Clientes",
  CM: "Contrato Marco",
};

async function fetchStats(group: string, maxAgeHours?: number): Promise<OpenStats> {
  const p = new URLSearchParams();
  p.set("group", group);
  if (maxAgeHours) p.set("maxAgeHours", String(maxAgeHours));
  const res = await fetch(`/api/incidents/open/stats?${p.toString()}`);
  if (!res.ok) throw new Error("Error al obtener estadística");
  return res.json();
}

// Vista estándar para grupos PEXA y CECOR: KPIs + tarjetas + TOP charts
function PexaCecorView({ group }: { group: "PEXA" | "CECOR" }) {
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [recentOnly, setRecentOnly] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const maxAgeHours = recentOnly ? 1 : undefined;

  const { data: stats, isFetching, refetch, dataUpdatedAt } = useQuery<OpenStats>({
    queryKey: ["open-stats", group],
    queryFn: () => fetchStats(group),
    refetchInterval: POLL_MS,
  });

  const { data: topStats } = useQuery<OpenStats>({
    queryKey: ["open-stats", group, recentOnly ? "1h" : "all"],
    queryFn: () => fetchStats(group, maxAgeHours),
    refetchInterval: POLL_MS,
  });

  const countdown = useCountdown(dataUpdatedAt);

  const ageBtn = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
      active ? "bg-accent text-white" : "border border-border text-text-muted hover:text-text-primary"
    );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end gap-3">
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

      <OpenKpis stats={stats} group={group} />

      <StatusBreakdown
        stats={stats}
        group={group}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
        selectedStatus={selectedStatus}
        onStatusSelect={setSelectedStatus}
      />

      {selectedStatus && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text-primary">
              Incidentes — <span className="text-accent">{selectedStatus}</span>
            </h2>
            <button
              type="button"
              onClick={() => setSelectedStatus(null)}
              className="rounded-md border border-border px-2 py-0.5 text-xs text-text-muted hover:text-text-primary"
            >
              Cerrar
            </button>
          </div>
          <OpenIncidentTable group={group} sortDir={sortDir} statusFilter={selectedStatus} />
        </div>
      )}

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
    </div>
  );
}

export function OpenIncidentsView() {
  const [group, setGroup] = useState<Group>("PEXA");

  const groupBtn = (g: Group) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      group === g ? "bg-accent text-white" : "border border-border text-text-muted hover:text-text-primary"
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(["PEXA", "CECOR", "EDC", "WSP", "CM"] as Group[]).map((g) => (
          <button key={g} type="button" onClick={() => setGroup(g)} className={groupBtn(g)}>
            {GROUP_LABELS[g]}
          </button>
        ))}
      </div>

      {(group === "PEXA" || group === "CECOR") && (
        <PexaCecorView key={group} group={group} />
      )}

      {group === "EDC" && <EscalatedPanel />}

      {group === "WSP" && <CriticosDownView />}

      {group === "CM" && <ContratoMarcoDownView />}
    </div>
  );
}
