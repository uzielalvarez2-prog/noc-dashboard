import { Users } from "lucide-react";
import type { OperatorStats } from "@/lib/queries/operators";

export function ShiftSummary({ operators }: { operators: OperatorStats[] }) {
  const totalOpen = operators.reduce((s, o) => s + o.openCount, 0);
  const totalClosed = operators.reduce((s, o) => s + o.closedCount, 0);
  const avgCompliance =
    operators.length > 0
      ? Math.round(operators.reduce((s, o) => s + o.slaCompliance, 0) / operators.length)
      : 100;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-4 w-4 text-text-muted" />
        <h2 className="text-base font-semibold text-text-primary">Resumen</h2>
        <span className="rounded-full bg-accent/15 px-2 py-0.5 font-mono text-xs text-accent">
          {operators.length} operador{operators.length !== 1 ? "es" : ""}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-3xl font-bold tabular-nums text-warning">{totalOpen}</p>
          <p className="mt-1 text-xs text-text-muted">incidentes abiertos</p>
        </div>
        <div>
          <p className="text-3xl font-bold tabular-nums text-success">{totalClosed}</p>
          <p className="mt-1 text-xs text-text-muted">cerrados (histórico)</p>
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
