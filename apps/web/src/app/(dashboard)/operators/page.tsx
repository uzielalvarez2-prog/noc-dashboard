import { getOperators } from "@/lib/queries/operators";
import { OperatorCard } from "@/components/operators/OperatorCard";
import { ShiftSummary } from "@/components/operators/ShiftSummary";

export const dynamic = "force-dynamic";

export default async function OperatorsPage() {
  const operators = await getOperators();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Operadores</h1>
        <p className="mt-1 text-sm text-text-muted">
          Métricas por operador — incidentes asignados, cerrados y cumplimiento SLA
        </p>
      </div>

      <ShiftSummary operators={operators} />

      {operators.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {operators.map((op) => (
            <OperatorCard key={op.name} op={op} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-text-muted">
            Sin operadores registrados. Los datos se generan automáticamente desde los incidentes abiertos y cerrados.
          </p>
        </div>
      )}
    </div>
  );
}
