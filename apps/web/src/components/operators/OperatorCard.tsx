import { cn } from "@/lib/utils";
import { User, CheckCircle, AlertTriangle, TrendingUp } from "lucide-react";
import type { OperatorWithMetrics } from "@/lib/queries/operators";

function Metric({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="text-center">
      <p className={cn("text-xl font-bold tabular-nums", color ?? "text-text-primary")}>{value}</p>
      <p className="mt-0.5 text-xs text-text-muted">{label}</p>
    </div>
  );
}

export function OperatorCard({ op }: { op: OperatorWithMetrics }) {
  const complianceColor =
    op.slaCompliance >= 90 ? "text-success" :
    op.slaCompliance >= 70 ? "text-warning" : "text-critical";

  return (
    <div className={cn(
      "rounded-lg border bg-surface p-5 transition-colors hover:bg-surface-elevated",
      op.isOnShift ? "border-success/40" : "border-border opacity-70"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated">
            <User className="h-4 w-4 text-text-muted" />
          </div>
          <div>
            <p className="font-semibold text-text-primary text-sm">{op.name}</p>
            <p className="font-mono text-xs text-text-muted">{op.id}</p>
          </div>
        </div>

        <span className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
          op.isOnShift
            ? "bg-success-dim text-success"
            : "bg-surface-elevated text-text-muted"
        )}>
          {op.isOnShift ? "En turno" : "Fuera de turno"}
        </span>
      </div>

      {/* Team */}
      <p className="mt-2 text-xs text-text-muted">
        Equipo: <span className="text-text-primary">{op.team}</span>
      </p>

      {/* Divider */}
      <div className="my-4 h-px bg-border" />

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2">
        <Metric
          label="Asignados"
          value={op.assignedCount}
          color={op.assignedCount > 5 ? "text-warning" : undefined}
        />
        <Metric
          label="Cerrados"
          value={op.resolvedCount}
          color="text-success"
        />
        <Metric
          label="SLA"
          value={`${op.slaCompliance}%`}
          color={complianceColor}
        />
      </div>

      {/* SLA bar */}
      <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-surface-elevated">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            op.slaCompliance >= 90 ? "bg-success" :
            op.slaCompliance >= 70 ? "bg-warning" : "bg-critical"
          )}
          style={{ width: `${op.slaCompliance}%` }}
        />
      </div>
    </div>
  );
}
