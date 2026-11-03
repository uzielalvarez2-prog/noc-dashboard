"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, X, MessageCircle, Check } from "lucide-react";
import type { OperatorStats } from "@/lib/queries/operators";
import { OperatorCard } from "./OperatorCard";
import { ShiftSummary } from "./ShiftSummary";
import { downloadXLSX } from "@/lib/excelExport";
import { operatorFullName } from "@/lib/operatorLogin";
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

// Texto plano listo para pegar en WhatsApp: encabezado con fecha/hora y total,
// una sección por grupo (PEXA · CECOR · Bot) y una viñeta por operador en línea.
// Solo nombres (sin carga). Los logins sin nombre mapeado salen tal cual y se
// listan al final en "Por mapear" para darlos de alta en el diccionario/BD.
function buildWhatsAppList(ops: OperatorStats[], activeStatus: string | null): string {
  const now = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  const stamp = `${p(now.getDate())}/${p(now.getMonth() + 1)} ${p(now.getHours())}:${p(now.getMinutes())}`;

  const groupOrder: ("PEXA" | "CECOR" | "Bot")[] = ["PEXA", "CECOR", "Bot"];
  const unmapped = new Set<string>();

  // Una línea por operador; recoge de paso los logins sin nombre.
  const nameOf = (login: string): string => {
    const full = operatorFullName(login);
    if (!full) unmapped.add(login);
    return full ?? login;
  };

  const sections: string[] = [];
  for (const g of groupOrder) {
    const inGroup = ops
      .filter((op) => op.groups.includes(g))
      .map((op) => nameOf(op.login))
      .sort((a, b) => a.localeCompare(b, "es"));
    if (inGroup.length === 0) continue;
    sections.push(`*${g}* (${inGroup.length})\n${inGroup.map((n) => `• ${n}`).join("\n")}`);
  }

  const total = ops.length;
  const header = activeStatus
    ? `🟢 Operadores en línea — ${activeStatus} — ${stamp} (${total})`
    : `🟢 Operadores en línea — ${stamp} (${total})`;

  const parts = [header, "", sections.join("\n\n")];
  if (unmapped.size > 0) {
    parts.push("", `⚠️ Por mapear: ${[...unmapped].sort().join(", ")}`);
  }
  return parts.join("\n");
}

const GROUP_STYLES: Record<string, { dot: string; text: string }> = {
  PEXA: { dot: "bg-accent", text: "text-accent" },
  CECOR: { dot: "bg-warning", text: "text-warning" },
  Bot: { dot: "bg-fuchsia-400", text: "text-fuchsia-300" },
};

function OperatorGroupSection({
  group,
  operators,
  activeStatus,
}: {
  group: "PEXA" | "CECOR" | "Bot";
  operators: OperatorStats[];
  activeStatus: string | null;
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
          <OperatorCard key={`${group}-${op.login}`} op={op} activeStatus={activeStatus} />
        ))}
      </div>
    </div>
  );
}

// Totales globales por estatus, para las pastillas del buscador.
function buildStatusTotals(ops: OperatorStats[]): { status: string; count: number }[] {
  const totals = new Map<string, number>();
  for (const op of ops)
    for (const s of op.statuses) totals.set(s.status, (totals.get(s.status) ?? 0) + s.count);
  return [...totals.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
}

function StatusFilterBar({
  totals,
  active,
  onSelect,
}: {
  totals: { status: string; count: number }[];
  active: string | null;
  onSelect: (status: string | null) => void;
}) {
  if (totals.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {totals.map(({ status, count }) => {
        const isActive = status === active;
        return (
          <button
            key={status}
            type="button"
            onClick={() => onSelect(isActive ? null : status)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              isActive
                ? "border-accent bg-accent/15 text-accent"
                : "border-border bg-surface text-text-muted hover:border-accent hover:text-accent"
            )}
          >
            <span className="truncate max-w-[12rem]">{status}</span>
            <span className="font-mono font-bold">{count}</span>
          </button>
        );
      })}
      {active && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <X className="h-3 w-3" /> Limpiar filtro
        </button>
      )}
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

  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [waCopied, setWaCopied] = useState(false);

  function onExport() {
    const { headers, rows } = buildPivot(data);
    downloadXLSX("operadores-en-vivo.xlsx", "Operadores", headers, rows);
  }

  const statusTotals = useMemo(() => buildStatusTotals(data), [data]);

  // Al filtrar por estatus, solo se muestran los operadores que tienen al
  // menos un incidente en ese estatus.
  const filtered = activeStatus
    ? data.filter((op) => op.statuses.some((s) => s.status === activeStatus))
    : data;

  // Copia la lista para WhatsApp respetando el filtro de estatus activo.
  async function onCopyWhatsApp() {
    const text = buildWhatsAppList(filtered, activeStatus);
    try {
      await navigator.clipboard.writeText(text);
      setWaCopied(true);
      setTimeout(() => setWaCopied(false), 2000);
    } catch {
      /* clipboard bloqueado: no-op, el usuario puede reintentar */
    }
  }

  const pexaOps = filtered.filter((op) => op.groups.includes("PEXA"));
  const cecorOps = filtered.filter((op) => op.groups.includes("CECOR"));
  const botOps = filtered.filter((op) => op.groups.includes("Bot"));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <ShiftSummary operators={data} />
      </div>

      {data.length > 0 ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <StatusFilterBar totals={statusTotals} active={activeStatus} onSelect={setActiveStatus} />
            <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={onCopyWhatsApp}
                title="Copiar la lista de operadores en línea para pegar en WhatsApp"
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  waCopied
                    ? "border-success text-success"
                    : "border-border bg-surface text-text-muted hover:border-emerald-500 hover:text-emerald-400"
                )}
              >
                {waCopied ? <Check className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
                {waCopied ? "Lista copiada" : "Copiar lista (WhatsApp)"}
              </button>
              <button
                type="button"
                onClick={onExport}
                className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent"
              >
                <Download className="h-3.5 w-3.5" /> Descargar tabla dinámica (Excel)
              </button>
            </div>
          </div>
          {filtered.length > 0 ? (
            <>
              <OperatorGroupSection group="PEXA" operators={pexaOps} activeStatus={activeStatus} />
              <OperatorGroupSection group="CECOR" operators={cecorOps} activeStatus={activeStatus} />
              <OperatorGroupSection group="Bot" operators={botOps} activeStatus={activeStatus} />
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border py-16 text-center">
              <p className="text-sm text-text-muted">
                Ningún operador tiene incidentes en estatus &quot;{activeStatus}&quot;.
              </p>
            </div>
          )}
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
