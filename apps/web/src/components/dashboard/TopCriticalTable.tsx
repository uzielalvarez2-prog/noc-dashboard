"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface CriticalIncident {
  id: string;
  title: string;
  group: string;
  severity: string;
  status: string;
  assignedTo: string | null;
  slaDeadline: string;
  slaBreached: boolean;
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
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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

export function TopCriticalTable() {
  const { data } = useQuery<KPIData>({
    queryKey: ["kpis"],
    queryFn: fetchKPIs,
    refetchInterval: 10_000,
  });

  const incidents = data?.criticalIncidents ?? [];

  return (
    <div className="rounded-lg border border-border bg-surface flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-text-primary">
            Incidentes con SLA Vencido
          </h2>
          {incidents.length > 0 && (
            <span className="rounded-full bg-critical-dim px-2 py-0.5 font-mono text-xs text-critical">
              {incidents.length}
            </span>
          )}
        </div>
        <a
          href="/sla"
          className="rounded-md border border-border bg-surface-elevated px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent"
        >
          Ver todos →
        </a>
      </div>

      {incidents.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-text-muted">
          Sin incidentes con SLA vencido
        </p>
      ) : (
        <div className="overflow-x-auto">
          {/* Tabla con scroll vertical fijo */}
          <div className="max-h-[320px] overflow-y-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-surface-elevated">
                <tr className="border-b border-border">
                  {["ID", "Grupo", "Asignado", "Tiempo abierto"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-medium uppercase tracking-wider text-text-muted"
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
                    <td className="px-3 py-2 font-mono text-text-muted">
                      {inc.id}
                    </td>
                    <td className="px-3 py-2">
                      <GroupBadge group={inc.group} />
                    </td>
                    <td className="px-3 py-2 font-mono text-text-primary">
                      {inc.assignedTo ?? (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-semibold text-critical">
                      {elapsedLabel(inc.openTime)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
