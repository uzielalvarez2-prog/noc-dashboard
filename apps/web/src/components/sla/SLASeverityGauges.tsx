import { cn } from "@/lib/utils";
import type { Severity } from "@/types";

const SEV_COLORS: Record<Severity, { bar: string; text: string; bg: string }> = {
  CRITICAL: { bar: "bg-critical",  text: "text-critical",  bg: "bg-critical-dim"  },
  HIGH:     { bar: "bg-warning",   text: "text-warning",   bg: "bg-warning-dim"   },
  MEDIUM:   { bar: "bg-info",      text: "text-info",      bg: "bg-[#0c1f33]"     },
  LOW:      { bar: "bg-text-muted", text: "text-text-muted", bg: "bg-surface-elevated" },
};

const SEV_LABELS: Record<Severity, string> = {
  CRITICAL: "Crítico", HIGH: "Alto", MEDIUM: "Medio", LOW: "Bajo",
};

interface SeverityData {
  compliance: number;
  total: number;
  breached: number;
}

interface SLASeverityGaugesProps {
  bySeverity: Record<Severity, SeverityData>;
}

export function SLASeverityGauges({ bySeverity }: SLASeverityGaugesProps) {
  const severities: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {severities.map((sev) => {
        const d = bySeverity[sev];
        const { bar, text, bg } = SEV_COLORS[sev];
        return (
          <div key={sev} className={cn("rounded-lg border border-border p-4", bg)}>
            <p className={cn("text-xs font-semibold uppercase tracking-wider", text)}>
              {SEV_LABELS[sev]}
            </p>

            {/* Número grande */}
            <p className={cn("mt-2 text-4xl font-bold tabular-nums", text)}>
              {d.compliance}%
            </p>
            <p className="text-xs text-text-muted">cumplimiento</p>

            {/* Barra */}
            <div className="mt-3 h-1.5 w-full rounded-full bg-surface-elevated overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700", bar)}
                style={{ width: `${d.compliance}%` }}
              />
            </div>

            {/* Conteos */}
            <div className="mt-3 flex justify-between text-xs text-text-muted">
              <span>Total: <b className="text-text-primary">{d.total}</b></span>
              <span>Breach: <b className={d.breached > 0 ? "text-critical" : "text-text-primary"}>{d.breached}</b></span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
