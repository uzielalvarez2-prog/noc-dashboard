"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Search, Star } from "lucide-react";
import { cn, formatHpsm, formatHpsmExcel } from "@/lib/utils";
import { downloadXLSX } from "@/lib/excelExport";
import { fetchEscalated, type EscalatedResponse } from "./EscalatedPanel";

interface CriticalIncident {
  id: string;
  group: string;
  status: string;
  assignedTo: string | null;
  company: string;
  serviceId: string;
  state: string;
  district: string;
  openTime: string;
}

interface KPIData {
  criticalIncidents: CriticalIncident[];
}

async function fetchKPIs(): Promise<KPIData> {
  const res = await fetch("/api/kpis");
  if (!res.ok) throw new Error("Error al obtener KPIs");
  return res.json();
}

function elapsedLabel(openTime: string): string {
  const mins = Math.floor((Date.now() - new Date(openTime).getTime()) / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function GroupBadge({ group }: { group: string }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-semibold",
        group === "PEXA" ? "bg-accent/15 text-accent" : "bg-warning/15 text-warning"
      )}
    >
      {group}
    </span>
  );
}

const COLS = [
  "Incident ID", "Tiempo abierto", "Apertura", "Estatus", "Empresa",
  "Servicio", "Estado", "Asignado", "Distrito", "Grupo",
];

export function TopCriticalTable() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data } = useQuery<KPIData>({
    queryKey: ["kpis"],
    queryFn: fetchKPIs,
    refetchInterval: 10_000,
  });

  // Marcas de atención especial (escalados) — compartidas con OpenIncidentTable
  const { data: escalated } = useQuery<EscalatedResponse>({
    queryKey: ["escalated"],
    queryFn: fetchEscalated,
    refetchInterval: 60_000,
  });
  const markedSet = new Set(escalated?.marked ?? []);

  const toggleEscalated = useMutation({
    mutationFn: async ({ incidentId, value }: { incidentId: string; value: boolean }) => {
      await fetch("/api/incidents/escalated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId, escalated: value }),
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["escalated"] }),
  });

  const all = data?.criticalIncidents ?? [];

  // Filtro por cualquier criterio
  const q = search.trim().toLowerCase();
  const incidents = q
    ? all.filter((inc) =>
        [
          inc.id, inc.status, inc.company, inc.serviceId, inc.state,
          inc.assignedTo ?? "", inc.district, inc.group, elapsedLabel(inc.openTime),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
    : all;

  function onExport() {
    const rows = incidents.map((inc) => [
      inc.id,
      elapsedLabel(inc.openTime),
      formatHpsmExcel(inc.openTime),
      inc.status,
      inc.company,
      inc.serviceId,
      inc.state,
      inc.assignedTo ?? "—",
      inc.district,
      inc.group,
    ]);
    downloadXLSX("top15-sla-vencido.xlsx", "SLA vencido", COLS, rows);
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-text-primary">
            Top 15 — SLA Vencido (más tiempo abiertos)
          </h2>
          {all.length > 0 && (
            <span className="rounded-full bg-critical-dim px-2 py-0.5 font-mono text-xs text-critical">
              {all.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar…"
              className="h-8 w-44 rounded-md border border-border bg-background/60 pl-7 pr-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>
          {all.length > 0 && (
            <button
              type="button"
              onClick={onExport}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <Download className="h-3.5 w-3.5" /> Excel
            </button>
          )}
        </div>
      </div>

      {all.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-text-muted">
          Sin incidentes con SLA vencido
        </p>
      ) : (
        // Alto fijo ~10 filas (cada fila ≈ 33px + header); el resto con scroll
        <div className="max-h-[380px] overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-surface-elevated">
              <tr className="border-b border-border">
                <th
                  title="Marcar para atención especial"
                  className="w-8 px-2 py-2 text-center"
                >
                  <Star className="mx-auto h-3.5 w-3.5 text-warning" />
                </th>
                {COLS.map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-3 py-2 text-left font-medium uppercase tracking-wider text-text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {incidents.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length + 1} className="px-4 py-8 text-center text-text-muted">
                    Sin resultados para “{search}”
                  </td>
                </tr>
              ) : (
                incidents.map((inc) => (
                  <tr
                    key={inc.id}
                    className={cn(
                      "border-b border-border/50 transition-colors",
                      markedSet.has(inc.id)
                        ? "bg-warning/10 hover:bg-warning/15"
                        : "bg-critical-dim/20 hover:bg-critical-dim/40"
                    )}
                  >
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        title="Atención especial"
                        checked={markedSet.has(inc.id)}
                        onChange={(e) =>
                          toggleEscalated.mutate({ incidentId: inc.id, value: e.target.checked })
                        }
                        className="h-3.5 w-3.5 cursor-pointer accent-[#f59e0b]"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-text-muted">{inc.id}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-critical">
                      {elapsedLabel(inc.openTime)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-text-muted">{formatHpsm(inc.openTime)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-text-primary">{inc.status}</td>
                    <td className="max-w-[12rem] px-3 py-2">
                      <span className="block truncate text-text-primary" title={inc.company}>{inc.company}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-text-muted">{inc.serviceId}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-text-primary">{inc.state}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-text-primary">
                      {inc.assignedTo ?? <span className="text-text-muted">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-text-primary">{inc.district}</td>
                    <td className="px-3 py-2"><GroupBadge group={inc.group} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
