"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { cn, formatHpsm } from "@/lib/utils";
import { downloadCSV, rowsToCSV } from "@/lib/openExport";

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
  const { data } = useQuery<KPIData>({
    queryKey: ["kpis"],
    queryFn: fetchKPIs,
    refetchInterval: 10_000,
  });

  const incidents = data?.criticalIncidents ?? [];

  function onExport() {
    const rows = incidents.map((inc) => [
      inc.id,
      elapsedLabel(inc.openTime),
      formatHpsm(inc.openTime),
      inc.status,
      inc.company,
      inc.serviceId,
      inc.state,
      inc.assignedTo ?? "—",
      inc.district,
      inc.group,
    ]);
    downloadCSV("top15-sla-vencido.csv", rowsToCSV(COLS, rows));
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-text-primary">
            Top 15 — SLA Vencido (más tiempo abiertos)
          </h2>
          {incidents.length > 0 && (
            <span className="rounded-full bg-critical-dim px-2 py-0.5 font-mono text-xs text-critical">
              {incidents.length}
            </span>
          )}
        </div>
        {incidents.length > 0 && (
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
        )}
      </div>

      {incidents.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-text-muted">
          Sin incidentes con SLA vencido
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-surface-elevated">
              <tr className="border-b border-border">
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
              {incidents.map((inc) => (
                <tr
                  key={inc.id}
                  className="border-b border-border/50 bg-critical-dim/20 transition-colors hover:bg-critical-dim/40"
                >
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
