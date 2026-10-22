"use client";

import { cn } from "@/lib/utils";
import { SEV, SEVERITY_ORDER, type Severity } from "./clienteTopUtils";

export type SeverityFilter = Severity | "all";

// Franja de resumen: cuántos clientes hay en cada semáforo. Los chips filtran la
// lista (click de nuevo para quitar el filtro) y la barra apilada da la proporción.
export function ClienteTopSummary({
  counts,
  total,
  filter,
  onFilter,
}: {
  counts: Record<Severity, number>;
  total: number;
  filter: SeverityFilter;
  onFilter: (f: SeverityFilter) => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => onFilter("all")}
          className={cn(
            "rounded-xl border px-3 py-2 text-left transition-all hover:-translate-y-0.5",
            "border-border bg-surface/60 text-text-primary",
            filter === "all" && "ring-2 ring-accent",
          )}
        >
          <span className="block text-2xl font-bold tabular-nums leading-none">{total}</span>
          <span className="mt-1 block text-[11px] font-medium text-text-muted">Clientes TOP</span>
        </button>
        {SEVERITY_ORDER.map((sev) => (
          <button
            key={sev}
            type="button"
            onClick={() => onFilter(filter === sev ? "all" : sev)}
            className={cn(
              "rounded-xl border px-3 py-2 text-left transition-all hover:-translate-y-0.5",
              SEV[sev].chip,
              filter === sev && "ring-2 ring-accent",
              counts[sev] === 0 && filter !== sev && "opacity-50",
            )}
          >
            <span className="block text-2xl font-bold tabular-nums leading-none">{counts[sev]}</span>
            <span className="mt-1 block text-[11px] font-medium opacity-90">{SEV[sev].label}</span>
          </button>
        ))}
      </div>

      {total > 0 && (
        <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-surface-elevated">
          {SEVERITY_ORDER.filter((sev) => counts[sev] > 0).map((sev) => (
            <span
              key={sev}
              className={cn("h-full transition-all", SEV[sev].seg)}
              style={{ width: `${(counts[sev] / total) * 100}%` }}
              title={`${SEV[sev].label}: ${counts[sev]}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
