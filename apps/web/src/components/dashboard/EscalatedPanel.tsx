"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EscalatedItem {
  incidentId: string;
  serviceId: string;
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

  return (
    <div className="flex flex-col rounded-lg border border-warning/40 bg-surface">
      <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/5 px-4 py-3">
        <Star className="h-4 w-4 fill-warning text-warning" />
        <h2 className="text-sm font-semibold text-text-primary">
          Atención especial — escalados
        </h2>
        {items.length > 0 && (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 font-mono text-xs text-warning">
            {items.length}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-text-muted">
          Sin incidentes marcados. Usa la casilla ★ en la tabla de abiertos para
          escalar uno aquí.
        </p>
      ) : (
        <div className="max-h-[320px] overflow-y-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-surface-elevated">
              <tr className="border-b border-border">
                {["Incidente ID", "Servicio", "Asignado", "Estatus", "Empresa", ""].map((h, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-left font-medium uppercase tracking-wider text-text-muted"
                  >
                    {h}
                  </th>
                ))}
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
                  <td className="px-3 py-2 font-mono text-text-primary">{it.incidentId}</td>
                  <td className="px-3 py-2 font-mono text-text-muted">{it.serviceId}</td>
                  <td className="px-3 py-2 font-mono text-text-primary">
                    {it.assignee ?? <span className="text-text-muted">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={it.status} stillOpen={it.stillOpen} />
                  </td>
                  <td className="max-w-[14rem] px-3 py-2">
                    <span className="block truncate text-text-primary" title={it.company}>
                      {it.company}
                    </span>
                  </td>
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
