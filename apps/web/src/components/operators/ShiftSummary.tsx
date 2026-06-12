import { Users } from "lucide-react";
import type { OperatorStats } from "@/lib/queries/operators";

export function ShiftSummary({ operators }: { operators: OperatorStats[] }) {
  const totalOpen = operators.reduce((s, o) => s + o.openCount, 0);
  const maxLoad = operators.length > 0 ? operators[0].openCount : 0;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-4 w-4 text-text-muted" />
        <h2 className="text-base font-semibold text-text-primary">Ahora mismo</h2>
        <span className="rounded-full bg-success/15 px-2 py-0.5 font-mono text-xs text-success">
          {operators.length} en línea
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-3xl font-bold tabular-nums text-success">{operators.length}</p>
          <p className="mt-1 text-xs text-text-muted">operadores gestionando</p>
        </div>
        <div>
          <p className="text-3xl font-bold tabular-nums text-warning">{totalOpen}</p>
          <p className="mt-1 text-xs text-text-muted">incidentes asignados</p>
        </div>
        <div>
          <p className="text-3xl font-bold tabular-nums text-accent">{maxLoad}</p>
          <p className="mt-1 text-xs text-text-muted">carga máxima por operador</p>
        </div>
      </div>
    </div>
  );
}
