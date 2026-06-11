import { cn } from "@/lib/utils";
import { User } from "lucide-react";
import type { OperatorStats } from "@/lib/queries/operators";

function Metric({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="text-center">
      <p className={cn("text-xl font-bold tabular-nums", color ?? "text-text-primary")}>{value}</p>
      <p className="mt-0.5 text-xs text-text-muted">{label}</p>
    </div>
  );
}

export function OperatorCard({ op }: { op: OperatorStats }) {
  const complianceColor =
    op.slaCompliance >= 90 ? "text-success" :
    op.slaCompliance >= 70 ? "text-warning" : "text-critical";

  return (
    <div className="rounded-lg border border-border bg-surface p-5 transition-colors hover:bg-surface-elevated">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated">
            <User className="h-4 w-4 text-text-muted" />
          </div>
          <p className="font-semibold text-text-primary text-sm">{op.name}</p>
        </div>

        {/* Badges de grupo */}
        <div className="flex gap-1 shrink-0">
          {op.groups.map((g) => (
            <span
              key={g}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                g === "PEXA" ? "bg-accent/15 text-accent" : "bg-warning/15 text-warning"
              )}
            >
              {g}
            </span>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="my-4 h-px bg-border" />

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2">
        <Metric
          label="Abiertos"
          value={op.openCount}
          color={op.openCount > 5 ? "text-warning" : undefined}
        />
        <Metric
          label="Cerrados"
          value={op.closedCount}
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
