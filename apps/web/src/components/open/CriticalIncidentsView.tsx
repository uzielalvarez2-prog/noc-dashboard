"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flame, Search, X, RefreshCw } from "lucide-react";
import { cn, formatHpsm } from "@/lib/utils";
import { HpsmIncidentId } from "@/components/shared/HpsmIncidentId";

export interface CriticalItem {
  incidentId: string;
  openTime: string | null;
  serviceId: string;
  state: string;
  district: string;
  siteName: string | null;
  assignee: string | null;
  status: string;
  company: string;
  group: string | null;
  stillOpen: boolean;
  markedAt: string;
}

export interface CriticalResponse {
  marked: string[];
  items: CriticalItem[];
}

export async function fetchCritical(): Promise<CriticalResponse> {
  const res = await fetch("/api/incidents/critical");
  if (!res.ok) throw new Error("Error al obtener críticos");
  return res.json();
}

function StatusCell({ status, stillOpen }: { status: string; stillOpen: boolean }) {
  if (!stillOpen)
    return <span className="text-xs font-medium text-text-muted">{status}</span>;
  const s = (status || "").toUpperCase();
  const color = s.includes("RESOLV") || s.includes("RESUELT")
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
  "Estado", "Distrito", "Sitio", "Asignado", "Grupo",
];

export function CriticalIncidentsView() {
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isFetching, refetch } = useQuery<CriticalResponse>({
    queryKey: ["critical"],
    queryFn: fetchCritical,
    refetchInterval: 30_000,
  });

  const unmark = useMutation({
    mutationFn: async (incidentId: string) => {
      await fetch("/api/incidents/critical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId, critical: false }),
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["critical"] }),
  });

  const items = data?.items ?? [];
  const abiertos = items.filter((it) => it.stillOpen).length;
  const cerrados = items.length - abiertos;

  const shown = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) =>
      [
        it.incidentId, it.openTime, it.status, it.company, it.serviceId,
        it.state, it.district, it.siteName ?? "", it.assignee ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [items, searchQuery]);

  return (
    <div className="overflow-hidden rounded-xl border border-critical/40 bg-surface/40 backdrop-blur-md">
      {/* Barra superior: título, contadores, buscador, refrescar. */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-surface/80 p-2 backdrop-blur-md">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Flame className="h-4 w-4 text-critical" />
          <span>Mis incidentes críticos</span>
        </div>
        <span className="font-mono text-xs text-text-muted">
          {abiertos} abierto{abiertos === 1 ? "" : "s"}
          {cerrados > 0 && <span className="ml-1">· {cerrados} cerrado{cerrados === 1 ? "" : "s"}</span>}
        </span>
        <div className="relative ml-auto min-w-[14rem] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar en mis críticos…"
            className="h-9 w-full rounded-md border border-border bg-background/60 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          title="Actualizar"
          className="rounded-md border border-border bg-surface p-2 text-text-muted hover:text-text-primary"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        </button>
      </div>

      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface-elevated/80 backdrop-blur-md">
            <tr>
              <th className="w-10 border-b border-border/60 px-2 py-2 text-center">
                <Flame className="mx-auto h-3.5 w-3.5 text-critical" />
              </th>
              {COLS.map((c) => (
                <th
                  key={c}
                  className="border-b border-border/60 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-muted"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={COLS.length + 1} className="py-12 text-center text-sm text-text-muted">
                  {searchQuery
                    ? "Sin resultados para tu búsqueda"
                    : "Aún no has marcado incidentes como críticos. Usa el ícono 🔥 en cualquier vista de abiertos."}
                </td>
              </tr>
            ) : (
              shown.map((it) => (
                <tr
                  key={it.incidentId}
                  className={cn(
                    "border-b border-border/40 transition-colors",
                    it.stillOpen
                      ? "bg-critical/5 hover:bg-critical/10"
                      : "opacity-60 hover:bg-surface-elevated/40"
                  )}
                >
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      title="Quitar de Críticos"
                      onClick={() => unmark.mutate(it.incidentId)}
                      className="mx-auto flex items-center justify-center text-text-muted hover:text-critical"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <HpsmIncidentId
                      incidentId={it.incidentId}
                      className="font-mono text-xs text-text-muted"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">
                    {it.openTime ? formatHpsm(it.openTime) : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <StatusCell status={it.status} stillOpen={it.stillOpen} />
                  </td>
                  <td className="px-3 py-2 text-xs text-text-primary">
                    <span className="block max-w-[12rem] truncate" title={it.company}>
                      {it.company}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">
                    <span className="block max-w-[11rem] truncate" title={it.serviceId}>
                      {it.serviceId}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-text-primary">{it.state}</td>
                  <td className="px-3 py-2 text-xs text-text-primary">{it.district}</td>
                  <td className="px-3 py-2 text-xs text-text-primary">
                    <span className="block max-w-[12rem] truncate" title={it.siteName ?? undefined}>
                      {it.siteName || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">{it.assignee ?? "—"}</td>
                  <td className="px-3 py-2">
                    <GroupBadge group={it.group} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
