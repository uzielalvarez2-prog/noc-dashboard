"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Siren, X, Download } from "lucide-react";
import { cn, formatHpsm, formatHpsmExcel } from "@/lib/utils";
import { downloadXLSX } from "@/lib/excelExport";

export interface EscalatedItem {
  incidentId: string;
  openTime: string | null;
  serviceId: string;
  state: string;
  district: string;
  assignee: string | null;
  status: string;
  company: string;
  group: string | null;
  stillOpen: boolean;
  markedBy: string;
  markedAt: string;
}

export interface EscalatedResponse {
  marked: string[];
  items: EscalatedItem[];
}

export async function fetchEscalated(): Promise<EscalatedResponse> {
  const res = await fetch("/api/incidents/escalated");
  if (!res.ok) throw new Error("Error al obtener escalados");
  return res.json();
}

function StatusBadge({ status, stillOpen }: { status: string; stillOpen: boolean }) {
  if (!stillOpen)
    return <span className="text-xs font-medium text-success">{status}</span>;
  const s = status.toUpperCase();
  const color = s.includes("RESOLVED")
    ? "text-success"
    : s.includes("PROGRESS")
    ? "text-warning"
    : s.includes("PENDING")
    ? "text-accent"
    : "text-text-muted";
  return <span className={cn("text-xs font-medium", color)}>{status || "—"}</span>;
}

function GroupBadge({ group }: { group: string | null }) {
  if (!group) return <span className="text-text-muted">—</span>;
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
  "Incident ID", "Apertura", "Estatus", "Empresa", "Servicio",
  "Estado", "Asignado", "Distrito", "Grupo",
];

export function EscalatedPanel() {
  const qc = useQueryClient();

  const { data } = useQuery<EscalatedResponse>({
    queryKey: ["escalated"],
    queryFn: fetchEscalated,
    refetchInterval: 10_000,
  });

  const unmark = useMutation({
    mutationFn: async (incidentId: string) => {
      await fetch("/api/incidents/escalated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId, escalated: false }),
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["escalated"] }),
  });

  const items = data?.items ?? [];

  function onExport() {
    const rows = items.map((it) => [
      it.incidentId,
      it.openTime ? formatHpsmExcel(it.openTime) : "—",
      it.status,
      it.company,
      it.serviceId,
      it.state,
      it.assignee ?? "—",
      it.district,
      it.group ?? "—",
    ]);
    downloadXLSX("escalados-atencion-especial.xlsx", "Escalados", COLS, rows);
  }

  return (
    <div className="flex flex-col rounded-lg border border-critical/50 bg-surface shadow-[0_0_20px_-6px] shadow-critical/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-critical/40 bg-critical/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-5 w-5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-critical/40" />
            <Siren className="relative h-4 w-4 animate-pulse text-critical" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wide text-critical">
            Atención especial — escalados
          </h2>
          {items.length > 0 && (
            <span className="rounded-full bg-critical px-2 py-0.5 font-mono text-xs font-bold text-white">
              {items.length}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-text-muted">
          Sin incidentes marcados. Usa la casilla ★ en la tabla de abiertos para
          escalar uno aquí.
        </p>
      ) : (
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-surface-elevated">
              <tr className="border-b border-border">
                {COLS.map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-3 py-2 text-left font-medium uppercase tracking-wider text-text-muted"
                  >
                    {h}
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr
                  key={it.incidentId}
                  className={cn(
                    "border-b border-border/50 transition-colors",
                    it.stillOpen
                      ? "bg-warning/5 hover:bg-warning/10"
                      : "opacity-60 hover:opacity-80"
                  )}
                >
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-text-primary">{it.incidentId}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-text-muted">
                    {it.openTime ? formatHpsm(it.openTime) : "—"}
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={it.status} stillOpen={it.stillOpen} /></td>
                  <td className="max-w-[12rem] px-3 py-2">
                    <span className="block truncate text-text-primary" title={it.company}>{it.company}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-text-muted">{it.serviceId}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-text-primary">{it.state}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-text-primary">
                    {it.assignee ?? <span className="text-text-muted">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-text-primary">{it.district}</td>
                  <td className="px-3 py-2"><GroupBadge group={it.group} /></td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      title="Quitar de atención especial"
                      onClick={() => unmark.mutate(it.incidentId)}
                      className="rounded p-1 text-text-muted transition-colors hover:bg-surface-elevated hover:text-critical"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
