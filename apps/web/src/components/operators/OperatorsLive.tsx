"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import type { OperatorStats } from "@/lib/queries/operators";
import { OperatorCard } from "./OperatorCard";
import { ShiftSummary } from "./ShiftSummary";
import { downloadXLSX } from "@/lib/excelExport";
import { cn } from "@/lib/utils";

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

const GROUP_STYLES: Record<string, { dot: string; text: string }> = {
  PEXA: { dot: "bg-accent", text: "text-accent" },
  CECOR: { dot: "bg-warning", text: "text-warning" },
  Bot: { dot: "bg-fuchsia-400", text: "text-fuchsia-300" },
};

function OperatorGroupSection({
  group,
  operators,
}: {
  group: "PEXA" | "CECOR" | "Bot";
  operators: OperatorStats[];
}) {
  if (operators.length === 0) return null;
  const { dot: dotClass, text: textClass } = GROUP_STYLES[group];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={cn("h-2.5 w-2.5 rounded-full", dotClass)} />
        <h3 className={cn("text-sm font-semibold uppercase tracking-wider", textClass)}>
          {group}
        </h3>
        <span className="rounded-full bg-surface-elevated px-2 py-0.5 font-mono text-xs text-text-muted">
          {operators.length}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {operators.map((op) => (
          <OperatorCard key={`${group}-${op.login}`} op={op} />
        ))}
      </div>
    </div>
  );
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
    downloadXLSX("operadores-en-vivo.xlsx", "Operadores", headers, rows);
  }

  const pexaOps = data.filter((op) => op.groups.includes("PEXA"));
  const cecorOps = data.filter((op) => op.groups.includes("CECOR"));
  const botOps = data.filter((op) => op.groups.includes("Bot"));

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
              <Download className="h-3.5 w-3.5" /> Descargar tabla dinámica (Excel)
            </button>
          </div>
          <OperatorGroupSection group="PEXA" operators={pexaOps} />
          <OperatorGroupSection group="CECOR" operators={cecorOps} />
          <OperatorGroupSection group="Bot" operators={botOps} />
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
