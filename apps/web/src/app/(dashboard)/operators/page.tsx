import { getOperators } from "@/lib/queries/operators";
import { OperatorsLive } from "@/components/operators/OperatorsLive";

export const dynamic = "force-dynamic";

export default async function OperatorsPage() {
  const operators = await getOperators().catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Operadores</h1>
        <p className="mt-1 text-sm text-text-muted">
          En vivo — quién está gestionando incidentes abiertos ahora mismo y en qué estatus
        </p>
      </div>

      <OperatorsLive initial={operators} />
    </div>
  );
}
