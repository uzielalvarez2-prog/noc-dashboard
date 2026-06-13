"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import type { OperatorStats } from "@/lib/queries/operators";
import { OperatorCard } from "./OperatorCard";
import { ShiftSummary } from "./ShiftSummary";
import { downloadCSV, rowsToCSV } from "@/lib/openExport";

async function fetchOperators(): Promise<OperatorStats[]> {
  const res = await fetch("/api/operators");
  if (!res.ok) throw new Error("Error al obtener operadores");
  return res.json();
}

// Tabla dinámica: una fila por operador, una columna por estatus + total
function buildPivot(ops: OperatorStats[]): { headers: string[]; rows: (string | number)[][] } {
  const statusSet = new Set<string>();
  for (const op of ops) for (const s of op.statuses) statusSet.add(s.status);
  const statuses = [...statusSet].sort();

  const headers = ["Operador", "Grupos", ...statuses, "Total"];
  const rows = ops.map((op) => {
    const byStatus = new Map(op.statuses.map((s) => [s.status, s.count]));
    return [
      op.login,
      op.groups.join(" / "),
      ...statuses.map((st) => byStatus.get(st) ?? 0),
      op.openCount,
    ];
  });
  return { headers, rows };
}

export function OperatorsLive({ initial }: { initial: OperatorStats[] }) {
  const { data = initial } = useQuery<OperatorStats[]>({
    queryKey: ["operators"],
    queryFn: fetchOperators,
    placeholderData: initial,
    refetchInterval: 60_000,
  });

  function onExport() {
    const { headers, rows } = buildPivot(data);
    downloadCSV("operadores-en-vivo.csv", rowsToCSV(headers, rows));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <ShiftSummary operators={data} />
      </div>

      {data.length > 0 ? (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onExport}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <Download className="h-3.5 w-3.5" /> Descargar tabla dinámica (CSV)
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.map((op) => (
              <OperatorCard key={op.login} op={op} />
            ))}
          </div>
        </>
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
