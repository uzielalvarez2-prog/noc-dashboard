"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OpenStats } from "@/types/open";
import { OpenKpis } from "./OpenKpis";
import { StatusBreakdown, ALL_STATUS } from "./StatusBreakdown";
import { TopByDimension } from "./TopByDimension";
import { OpenIncidentTable } from "./OpenIncidentTable";
import { EdcTabs } from "./EdcTabs";
import { CriticosDownView } from "@/components/warroom/CriticosDownView";
import { ContratoMarcoDownView } from "@/components/warroom/ContratoMarcoDownView";
import type { SortDir } from "@/lib/exportOpenIncidents";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

const POLL_MS = 240_000;

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

  const { data: stats, isFetching, refetch } = useQuery<OpenStats>({
    queryKey: ["open-stats", group],
    queryFn: () => fetchStats(group),
    refetchInterval: POLL_MS,
  });

  const { data: topStats } = useQuery<OpenStats>({
    queryKey: ["open-stats", group, recentOnly ? "1h" : "all"],
    queryFn: () => fetchStats(group, maxAgeHours),
    refetchInterval: POLL_MS,
  });

  const ageBtn = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
      active ? "bg-accent text-white" : "border border-border text-text-muted hover:text-text-primary"
    );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end gap-3">
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
              {selectedStatus === ALL_STATUS ? (
                "Todos los incidentes abiertos"
              ) : (
                <>
                  Incidentes — <span className="text-accent">{selectedStatus}</span>
                </>
              )}
            </h2>
            <button
              type="button"
              onClick={() => setSelectedStatus(null)}
              className="rounded-md border border-border px-2 py-0.5 text-xs text-text-muted hover:text-text-primary"
            >
              Cerrar
            </button>
          </div>
          <OpenIncidentTable
            group={group}
            sortDir={sortDir}
            statusFilter={selectedStatus === ALL_STATUS ? undefined : selectedStatus}
          />
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

// Orden visual pedido: EDC, PEXA, WSP. Clientes, Contrato Marco, CECOR.
const GROUP_ORDER: Group[] = ["EDC", "PEXA", "WSP", "CM", "CECOR"];

// Estilo "neon pill" (igual criterio que los botones de War Room): borde y
// fondo del color siempre visibles, atenuados por opacity cuando no está
// activo, con ring + glow al seleccionar.
const GROUP_STYLE: Record<Group, { border: string; bg: string; text: string; ring: string; glow: string }> = {
  EDC: { border: "border-red-500/50", bg: "bg-red-500/10", text: "text-red-400", ring: "ring-red-500", glow: "shadow-[0_0_10px_2px_rgba(239,68,68,0.4)]" },
  PEXA: { border: "border-blue-400/50", bg: "bg-blue-500/10", text: "text-blue-300", ring: "ring-blue-400", glow: "shadow-[0_0_10px_2px_rgba(96,165,250,0.4)]" },
  WSP: { border: "border-rose-500/50", bg: "bg-rose-500/10", text: "text-rose-400", ring: "ring-rose-500", glow: "shadow-[0_0_10px_2px_rgba(244,63,94,0.4)]" },
  CM: { border: "border-amber-500/50", bg: "bg-amber-500/10", text: "text-amber-400", ring: "ring-amber-500", glow: "shadow-[0_0_10px_2px_rgba(245,158,11,0.4)]" },
  CECOR: { border: "border-blue-400/50", bg: "bg-blue-500/10", text: "text-blue-300", ring: "ring-blue-400", glow: "shadow-[0_0_10px_2px_rgba(96,165,250,0.4)]" },
};

export function OpenIncidentsView() {
  const [group, setGroup] = useState<Group>("PEXA");

  const groupBtn = (g: Group) => {
    const s = GROUP_STYLE[g];
    const active = group === g;
    return cn(
      "rounded-lg border px-3 py-2 text-sm font-semibold transition-all",
      s.border,
      s.bg,
      s.text,
      active ? cn("ring-2", s.ring, s.glow) : "opacity-60 hover:opacity-100"
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {GROUP_ORDER.map((g) => (
          <button key={g} type="button" onClick={() => setGroup(g)} className={groupBtn(g)}>
            {GROUP_LABELS[g]}
          </button>
        ))}
      </div>

      {(group === "PEXA" || group === "CECOR") && (
        <PexaCecorView key={group} group={group} />
      )}

      {group === "EDC" && <EdcTabs />}

      {group === "WSP" && <CriticosDownView />}

      {group === "CM" && <ContratoMarcoDownView />}
    </div>
  );
}
