"use client";

import { cn } from "@/lib/utils";
import { SEV, SEVERITY_ORDER, type Severity } from "./clienteTopUtils";

// Barra apilada con la proporción de clientes por semáforo (el detalle de cada
// segmento sale al pasar el mouse).
export function ClienteTopSummary({
  counts,
  total,
}: {
  counts: Record<Severity, number>;
  total: number;
}) {
  if (total === 0) return null;
  return (
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
  );
}
