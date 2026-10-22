"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import {
  SEV,
  SORT_LABELS,
  formatDilacion,
  matchHint,
  maxDilacion,
  severityOf,
  type ClienteTopStat,
  type SortKey,
} from "./clienteTopUtils";

// Panel izquierdo: lista compacta de clientes (semáforo + nombre + IM's + barra).
// Seleccionar NO oculta la lista; con ↑/↓ se cambia de cliente sin soltar el teclado.
export function ClienteTopList({
  clientes,
  activeId,
  query,
  maxOpen,
  sort,
  onSort,
  onSelect,
}: {
  clientes: ClienteTopStat[];
  activeId: string | null;
  /** Búsqueda ya normalizada — solo para mostrar por qué salió cada cliente. */
  query: string;
  maxOpen: number;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  onSelect: (id: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  function focusRow(id: string) {
    listRef.current?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const idx = clientes.findIndex((c) => c.id === activeId);
    const next = e.key === "ArrowDown" ? Math.min(idx + 1, clientes.length - 1) : Math.max(idx - 1, 0);
    const target = clientes[next];
    if (!target) return;
    e.preventDefault();
    onSelect(target.id);
    focusRow(target.id);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface/60 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.6)] backdrop-blur-md">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
          {clientes.length} cliente{clientes.length === 1 ? "" : "s"}
        </span>
        <label className="flex items-center gap-1.5 text-[11px] text-text-muted">
          Orden
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as SortKey)}
            className="rounded-md border border-border bg-background/60 px-1.5 py-0.5 text-[11px] text-text-primary focus:border-accent focus:outline-none"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div ref={listRef} onKeyDown={onKeyDown} className="max-h-[68vh] overflow-y-auto">
        {clientes.map((c) => {
          const sev = SEV[severityOf(c)];
          const pct = c.openCount === 0 ? 0 : Math.max(6, (c.openCount / maxOpen) * 100);
          const dilMax = maxDilacion(c);
          const hint = matchHint(c, query);
          const active = c.id === activeId;
          return (
            <button
              key={c.id}
              type="button"
              data-id={c.id}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(c.id)}
              className={cn(
                "group flex w-full flex-col gap-2 border-b border-l-2 border-b-border/40 px-4 py-3 text-left transition-colors last:border-b-0 focus:outline-none",
                active
                  ? "border-l-accent bg-accent/10"
                  : "border-l-transparent hover:bg-surface-elevated/50 focus-visible:bg-surface-elevated/50",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-sm font-semibold text-text-primary"
                    title={c.displayName !== c.company ? `${c.displayName} — ${c.company}` : c.company}
                  >
                    {c.displayName}
                  </span>
                  {hint && (
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-accent/80">{hint}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-baseline gap-2.5">
                  {dilMax > 0 && (
                    <span
                      className="text-[11px] font-medium text-warning/90"
                      title={`${c.delayedMs.length} IM's con dilación — la mayor: ${formatDilacion(dilMax)}`}
                    >
                      {formatDilacion(dilMax)}
                    </span>
                  )}
                  <span className={cn("text-sm font-bold tabular-nums", sev.text)}>
                    {c.openCount}
                    <span className="ml-1 text-[10px] font-medium text-text-muted">IM&apos;s</span>
                  </span>
                </span>
              </div>
              <div className="relative h-1 w-full rounded-full bg-surface-elevated">
                <span
                  className={cn("absolute inset-y-0 left-0 rounded-full transition-all", sev.track)}
                  style={{ width: `${pct}%` }}
                />
                <span
                  className={cn(
                    "absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all",
                    sev.dot,
                  )}
                  style={{ left: `${pct}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
