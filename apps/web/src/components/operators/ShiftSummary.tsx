import { Users, CheckCircle } from "lucide-react";
import type { OperatorWithMetrics } from "@/lib/queries/operators";

export function ShiftSummary({ operators }: { operators: OperatorWithMetrics[] }) {
  const onShift = operators.filter((o) => o.isOnShift);
  const totalAssigned = onShift.reduce((s, o) => s + o.assignedCount, 0);
  const totalResolved = onShift.reduce((s, o) => s + o.resolvedCount, 0);
  const avgCompliance =
    onShift.length > 0
      ? Math.round(onShift.reduce((s, o) => s + o.slaCompliance, 0) / onShift.length)
      : 100;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-4 w-4 text-text-muted" />
        <h2 className="text-base font-semibold text-text-primary">Turno activo</h2>
        <span className="rounded-full bg-success-dim px-2 py-0.5 font-mono text-xs text-success">
          {onShift.length} operador{onShift.length !== 1 ? "es" : ""}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-3xl font-bold tabular-nums text-text-primary">{totalAssigned}</p>
          <p className="mt-1 text-xs text-text-muted">incidentes activos</p>
        </div>
        <div>
          <p className="text-3xl font-bold tabular-nums text-success">{totalResolved}</p>
          <p className="mt-1 text-xs text-text-muted">cerrados hoy</p>
        </div>
        <div>
          <p className={`text-3xl font-bold tabular-nums ${
            avgCompliance >= 90 ? "text-success" : avgCompliance >= 70 ? "text-warning" : "text-critical"
          }`}>
            {avgCompliance}%
          </p>
          <p className="mt-1 text-xs text-text-muted">SLA promedio</p>
        </div>
      </div>
    </div>
  );
}
