"use client";

import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown } from "lucide-react";
import type { OpenStats } from "@/types/open";
import type { SortDir } from "@/lib/exportOpenIncidents";
import { cn } from "@/lib/utils";

function statusAccent(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("RESOLV")) return "text-success";
  if (s.includes("PROGRESS")) return "text-warning";
  if (s.includes("PENDING")) return "text-accent";
  return "text-text-primary";
}

export function StatusBreakdown({
  stats,
  group,
  sortDir,
  onSortDirChange,
  selectedStatus,
  onStatusSelect,
}: {
  stats?: OpenStats;
  group: string;
  sortDir: SortDir;
  onSortDirChange: (d: SortDir) => void;
  selectedStatus: string | null;
  onStatusSelect: (status: string | null) => void;
}) {
  const byStatus = stats?.byStatus ?? [];
  const showTotal = group !== "ALL";

  const sortBtn = (dir: SortDir, label: string, Icon: typeof ArrowDownWideNarrow) => (
    <button
      type="button"
      onClick={() => onSortDirChange(dir)}
      title={`Excel ordenado por apertura: ${label}`}
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
        sortDir === dir
          ? "bg-accent text-white"
          : "border border-border text-text-muted hover:text-text-primary"
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Por estatus</h2>
        <div className="flex items-center gap-1">
          <span className="mr-1 hidden text-[11px] text-text-muted sm:inline">Orden del Excel:</span>
          {sortBtn("desc", "Reciente → antiguo", ArrowDownWideNarrow)}
          {sortBtn("asc", "Antiguo → reciente", ArrowUpNarrowWide)}
        </div>
      </div>

      {byStatus.length === 0 && !showTotal ? (
        <p className="rounded-xl border border-border/60 bg-surface/40 p-4 text-center text-xs text-text-muted">
          Sin datos de estatus
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {showTotal && (
            <div className="flex flex-col items-start rounded-xl border border-warning/50 bg-warning/5 p-4 ring-1 ring-warning/40 shadow-[0_0_14px_2px_rgba(245,158,11,0.30)] backdrop-blur-md">
              <p className="truncate text-xs font-medium uppercase tracking-wider text-warning/90">
                Incidentes abiertos
              </p>
              <p className="mt-1 text-2xl font-bold text-warning drop-shadow-[0_0_7px_rgba(245,158,11,0.8)]">
                {stats?.totalIncidents ?? "—"}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">únicos</p>
            </div>
          )}
          {byStatus.map(({ status, incidents }) => {
            const isSelected = selectedStatus === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => onStatusSelect(isSelected ? null : status)}
                title={`Ver incidentes con estatus "${status}"`}
                className={cn(
                  "group flex flex-col items-start rounded-xl border p-4 text-left backdrop-blur-md transition-colors",
                  isSelected
                    ? "border-accent bg-accent/10 ring-1 ring-accent"
                    : "border-border/60 bg-surface/60 hover:border-accent/60"
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <p className="truncate text-xs font-medium uppercase tracking-wider text-text-muted" title={status}>
                    {status}
                  </p>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-all",
                      isSelected ? "rotate-180 text-accent" : "text-text-muted/40 group-hover:text-accent"
                    )}
                  />
                </div>
                <p className={cn("mt-1 text-2xl font-bold", statusAccent(status))}>{incidents}</p>
                <p className="mt-0.5 text-xs text-text-muted">incidentes</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
