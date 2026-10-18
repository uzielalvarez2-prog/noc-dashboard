"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/components/layout/ThemeProvider";
import { PageHeader } from "@/components/layout/PageHeaderProvider";
import type { OpenStats } from "@/types/open";
import { OpenKpis } from "./OpenKpis";
import { StatusBreakdown, ALL_STATUS } from "./StatusBreakdown";
import { TopByDimension } from "./TopByDimension";
import { FallasMasivas } from "./FallasMasivas";
import { CecorEstadisticas } from "./CecorEstadisticas";
import { OpenIncidentTable } from "./OpenIncidentTable";
import { EdcTabs } from "./EdcTabs";
import { ClienteTopView } from "./ClienteTopView";
import { SisaView } from "@/components/sisa/SisaView";
import { SisaCecorView } from "./SisaCecorView";
import type { SortDir } from "@/lib/exportOpenIncidents";
import { cn } from "@/lib/utils";

const POLL_MS = 240_000;

type Group = "CLIENTE_TOP" | "PEXA" | "CECOR" | "EDC" | "SISA";

const GROUP_LABELS: Record<Group, string> = {
  CLIENTE_TOP: "Cliente TOP - PEXA",
  PEXA: "PEXA",
  CECOR: "CECOR",
  EDC: "EDC",
  SISA: "SISA",
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
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [recentOnly, setRecentOnly] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<"abiertos" | "sisa" | "estadisticas" | "fallas">("abiertos");
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

  const subTabBtn = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
      active
        ? isLight ? "bg-violet-100 text-violet-800 ring-1 ring-violet-400" : "bg-violet-500/20 text-violet-200 ring-1 ring-violet-500"
        : "border border-border text-text-muted hover:text-text-primary"
    );

  // Barra de sub-pestañas: CECOR (Abiertos · SISA CECOR · Estadísticas) y
  // PEXA (Abiertos · Fallas Masivas).
  const cecorSubTabs = group === "CECOR" && (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => setSubTab("abiertos")} className={subTabBtn(subTab === "abiertos")}>
        Abiertos
      </button>
      <button type="button" onClick={() => setSubTab("sisa")} className={subTabBtn(subTab === "sisa")}>
        SISA CECOR
      </button>
      <button type="button" onClick={() => setSubTab("estadisticas")} className={subTabBtn(subTab === "estadisticas")}>
        Estadísticas
      </button>
    </div>
  );

  const pexaSubTabs = group === "PEXA" && (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => setSubTab("abiertos")} className={subTabBtn(subTab === "abiertos")}>
        En gestión
      </button>
      <button type="button" onClick={() => setSubTab("fallas")} className={subTabBtn(subTab === "fallas")}>
        Fallas Masivas
      </button>
    </div>
  );

  const topSection = (
    <>
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
          variant={group === "PEXA" ? "radial" : "bars"}
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
          variant={group === "PEXA" ? "radial" : "bars"}
        />
      </div>

      {/* Detector de fallas masivas: agrupa aperturas cercanas en el tiempo por
          zona (no respeta el filtro ≤1h de arriba; analiza todos los abiertos). */}
      <FallasMasivas group={group} />
    </>
  );

  if (group === "PEXA" && subTab === "fallas") {
    return (
      <div className="space-y-5">
        {pexaSubTabs}
        {topSection}
      </div>
    );
  }

  if (group === "CECOR" && subTab === "sisa") {
    return (
      <div className="space-y-5">
        {cecorSubTabs}
        <SisaCecorView />
      </div>
    );
  }

  if (group === "CECOR" && subTab === "estadisticas") {
    return (
      <div className="space-y-5">
        {cecorSubTabs}
        <CecorEstadisticas group={group} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {cecorSubTabs}
      {pexaSubTabs}

      <OpenKpis stats={stats} group={group} />

      <StatusBreakdown
        stats={stats}
        group={group}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
        selectedStatus={selectedStatus}
        onStatusSelect={setSelectedStatus}
        onRefresh={() => void refetch()}
        isFetching={isFetching}
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

      {/* En PEXA el Top y las fallas masivas viven en su propia sub-pestaña. */}
      {group === "CECOR" && topSection}
    </div>
  );
}

// Orden visual: Cliente TOP, EDC, PEXA, CECOR, SISA.
const GROUP_ORDER: Group[] = ["CLIENTE_TOP", "EDC", "PEXA", "CECOR", "SISA"];

type GroupStyle = { border: string; bg: string; text: string; ring: string; glow: string };

function getGroupStyle(isLight: boolean): Record<Group, GroupStyle> {
  return isLight ? {
    CLIENTE_TOP: { border: "border-amber-400",  bg: "bg-amber-50",  text: "text-amber-700",  ring: "ring-amber-400",  glow: "" },
    EDC:   { border: "border-red-400",    bg: "bg-red-50",    text: "text-red-700",    ring: "ring-red-400",    glow: "" },
    PEXA:  { border: "border-blue-400",   bg: "bg-blue-50",   text: "text-blue-700",   ring: "ring-blue-400",   glow: "" },
    CECOR: { border: "border-blue-400",   bg: "bg-blue-50",   text: "text-blue-700",   ring: "ring-blue-400",   glow: "" },
    SISA:  { border: "border-violet-400", bg: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-400", glow: "" },
  } : {
    CLIENTE_TOP: { border: "border-amber-500/50", bg: "bg-amber-500/10", text: "text-amber-300", ring: "ring-amber-500", glow: "shadow-[0_0_10px_2px_rgba(245,158,11,0.4)]" },
    EDC:   { border: "border-red-500/50",    bg: "bg-red-500/10",    text: "text-red-400",    ring: "ring-red-500",    glow: "shadow-[0_0_10px_2px_rgba(239,68,68,0.4)]" },
    PEXA:  { border: "border-blue-400/50",   bg: "bg-blue-500/10",   text: "text-blue-300",   ring: "ring-blue-400",   glow: "shadow-[0_0_10px_2px_rgba(96,165,250,0.4)]" },
    CECOR: { border: "border-blue-400/50",   bg: "bg-blue-500/10",   text: "text-blue-300",   ring: "ring-blue-400",   glow: "shadow-[0_0_10px_2px_rgba(96,165,250,0.4)]" },
    SISA:  { border: "border-violet-500/50", bg: "bg-violet-500/10", text: "text-violet-300", ring: "ring-violet-500", glow: "shadow-[0_0_10px_2px_rgba(139,92,246,0.4)]" },
  };
}

const OPEN_SUBTITLE = "PEXA + CECOR · busca por cualquier columna, detecta falla masiva y exporta";

export function OpenIncidentsView({ trailing }: { trailing?: React.ReactNode }) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [group, setGroup] = useState<Group>("CLIENTE_TOP");

  const groupBtn = (g: Group) => {
    const s = getGroupStyle(isLight)[g];
    const active = group === g;
    return cn(
      "rounded-lg border px-3 py-2 text-sm font-semibold transition-all",
      s.border, s.bg, s.text,
      active ? cn("ring-2", s.ring, s.glow) : "opacity-60 hover:opacity-100"
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader title={`Incidentes abiertos · ${GROUP_LABELS[group]}`} subtitle={OPEN_SUBTITLE} />

      <div className="flex flex-wrap items-center gap-2">
        {GROUP_ORDER.map((g) => (
          <button key={g} type="button" onClick={() => setGroup(g)} className={groupBtn(g)}>
            {GROUP_LABELS[g]}
          </button>
        ))}
        {trailing && <div className="ml-auto">{trailing}</div>}
      </div>

      {group === "CLIENTE_TOP" && <ClienteTopView />}

      {(group === "PEXA" || group === "CECOR") && (
        <PexaCecorView key={group} group={group} />
      )}

      {group === "EDC" && <EdcTabs />}

      {group === "SISA" && <SisaView />}
    </div>
  );
}
