"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";

interface CriticalIncident {
  id: string;
  title: string;
  severity: string;
  status: string;
  assignedTo: string | null;
  slaDeadline: string;
  slaBreached: boolean;
  createdAt: string;
}

interface KPIData {
  criticalIncidents: CriticalIncident[];
}

async function fetchKPIs(): Promise<KPIData> {
  const res = await fetch("/api/kpis");
  if (!res.ok) throw new Error("Error al obtener KPIs");
  return res.json();
}

export function AlertBanner() {
  const { data } = useQuery<KPIData>({
    queryKey: ["kpis"],
    queryFn: fetchKPIs,
    refetchInterval: 10_000,
  });

  const critical = data?.criticalIncidents ?? [];

  if (critical.length === 0) return null;

  return (
    <div className="rounded-lg border border-critical bg-critical-dim p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-critical" />
        <span className="text-sm font-semibold text-critical">
          {critical.length} incidente{critical.length !== 1 ? "s" : ""} CRÍTICO
          {critical.length !== 1 ? "S" : ""} activo
          {critical.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-2">
        {critical.map((inc) => (
          <div
            key={inc.id}
            className={cn(
              "flex items-start justify-between gap-4 rounded border border-critical/30 bg-background/60 px-3 py-2",
              inc.slaBreached && "border-critical"
            )}
          >
            <div className="min-w-0 flex-1">
              <span className="font-mono text-xs text-text-muted">
                {inc.id}
              </span>
              {inc.slaBreached && (
                <span className="ml-2 rounded bg-critical px-1.5 py-0.5 text-xs font-bold text-white">
                  SLA VENCIDO
                </span>
              )}
              <p className="mt-0.5 truncate text-sm text-text-primary">
                {inc.title}
              </p>
              <p className="text-xs text-text-muted">
                {inc.assignedTo
                  ? `Asignado a: ${inc.assignedTo}`
                  : "Sin asignar"}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1">
              <div className="flex items-center gap-1 text-xs text-warning">
                <Clock className="h-3 w-3" />
                <span>
                  {new Date(inc.slaDeadline).toLocaleTimeString("es-MX", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </span>
              </div>
              <span className="text-xs text-text-muted">
                {formatRelativeTime(inc.createdAt)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
