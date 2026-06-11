"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { SeverityBadge } from "@/components/incidents/SeverityBadge";
import { cn } from "@/lib/utils";
import type { Severity } from "@/types";

interface CriticalIncident {
  id: string;
  title: string;
  severity: Severity;
  status: string;
  assignedTo: string | null;
  slaDeadline: string;
  slaBreached: boolean;
}

interface KPIData {
  criticalIncidents: CriticalIncident[];
}

async function fetchKPIs(): Promise<KPIData> {
  const res = await fetch("/api/kpis");
  if (!res.ok) throw new Error("Error al obtener KPIs");
  return res.json();
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En progreso",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};

export function TopCriticalTable() {
  const { data } = useQuery<KPIData>({
    queryKey: ["kpis"],
    queryFn: fetchKPIs,
    refetchInterval: 10_000,
  });

  const incidents = data?.criticalIncidents ?? [];

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-base font-semibold text-text-primary">
          Incidentes con SLA Vencido
        </h2>
        <Link
          href="/sla"
          className="text-xs text-accent hover:underline"
        >
          Ver todos →
        </Link>
      </div>

      {incidents.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-text-muted">
          Sin incidentes con SLA vencido
        </p>
      ) : (
        <div className="divide-y divide-border">
          {incidents.map((inc) => {
            const deadline = new Date(inc.slaDeadline);
            const minsLeft = Math.floor(
              (deadline.getTime() - Date.now()) / 60000
            );
            const isUrgent = minsLeft < 120;
            const isBreached = inc.slaBreached || minsLeft < 0;

            return (
              <Link
                key={inc.id}
                href={`/incidents/${inc.id}`}
                className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-elevated"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-text-muted">
                      {inc.id}
                    </span>
                    <SeverityBadge severity={inc.severity} />
                    {isBreached && (
                      <span className="rounded bg-critical px-1.5 py-0.5 text-xs font-bold text-white">
                        BREACH
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-text-primary">
                    {inc.title}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      "font-mono text-xs font-medium",
                      isBreached
                        ? "text-critical"
                        : isUrgent
                        ? "text-warning"
                        : "text-text-muted"
                    )}
                  >
                    {isBreached
                      ? "SLA vencido"
                      : minsLeft < 60
                      ? `${minsLeft}m`
                      : `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m`}
                  </p>
                  <p className="text-xs text-text-muted">
                    {STATUS_LABELS[inc.status] ?? inc.status}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
