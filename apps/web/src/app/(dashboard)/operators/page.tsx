import { getOperators } from "@/lib/queries/operators";
import { OperatorCard } from "@/components/operators/OperatorCard";
import { ShiftSummary } from "@/components/operators/ShiftSummary";

export const dynamic = "force-dynamic";

export default async function OperatorsPage() {
  const operators = await getOperators();
  const onShift = operators.filter((o) => o.isOnShift);
  const offShift = operators.filter((o) => !o.isOnShift);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Operadores</h1>
        <p className="mt-1 text-sm text-text-muted">
          Métricas por operador — incidentes asignados, cerrados y cumplimiento SLA
        </p>
      </div>

      <ShiftSummary operators={operators} />

      {/* En turno */}
      {onShift.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
            En turno ({onShift.length})
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {onShift.map((op) => <OperatorCard key={op.id} op={op} />)}
          </div>
        </section>
      )}

      {/* Fuera de turno */}
      {offShift.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
            Fuera de turno ({offShift.length})
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {offShift.map((op) => <OperatorCard key={op.id} op={op} />)}
          </div>
        </section>
      )}

      {operators.length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-text-muted">
            Sin operadores registrados. El worker los sincroniza desde HPSM.
          </p>
        </div>
      )}
    </div>
  );
}
