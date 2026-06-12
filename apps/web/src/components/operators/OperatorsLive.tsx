"use client";

import { useQuery } from "@tanstack/react-query";
import type { OperatorStats } from "@/lib/queries/operators";
import { OperatorCard } from "./OperatorCard";
import { ShiftSummary } from "./ShiftSummary";

async function fetchOperators(): Promise<OperatorStats[]> {
  const res = await fetch("/api/operators");
  if (!res.ok) throw new Error("Error al obtener operadores");
  return res.json();
}

export function OperatorsLive({ initial }: { initial: OperatorStats[] }) {
  const { data = initial } = useQuery<OperatorStats[]>({
    queryKey: ["operators"],
    queryFn: fetchOperators,
    placeholderData: initial,
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <ShiftSummary operators={data} />

      {data.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.map((op) => (
            <OperatorCard key={op.login} op={op} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-text-muted">
            Nadie tiene incidentes abiertos asignados en este momento.
          </p>
        </div>
      )}
    </div>
  );
}
