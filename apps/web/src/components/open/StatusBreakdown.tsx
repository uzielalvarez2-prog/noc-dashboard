"use client";

import { useState, type MouseEvent } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, Copy, RefreshCw } from "lucide-react";
import type { OpenStats } from "@/types/open";
import type { SortDir } from "@/lib/exportOpenIncidents";
import { copyElementAsImage } from "@/lib/copyImage";
import { cn } from "@/lib/utils";

// Centinela para la tarjeta del total: seleccionarla muestra TODOS los
// incidentes abiertos (sin filtro de estatus) en la tabla.
export const ALL_STATUS = "__ALL__";

type CopyState = "copying" | "done" | "error";

function statusAccent(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("RESOLV")) return "text-success";
  if (s.includes("PROGRESS")) return "text-warning";
  if (s.includes("PENDING VENDOR")) return "text-critical";
  if (s.includes("PENDING OTHER")) return "text-text-muted";
  if (s.includes("PENDING")) return "text-accent";
  return "text-text-primary";
}

function statusBarColor(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("RESOLV")) return "bg-success";
  if (s.includes("PROGRESS")) return "bg-warning";
  if (s.includes("PENDING VENDOR")) return "bg-critical";
  if (s.includes("PENDING OTHER")) return "bg-text-muted";
  if (s.includes("PENDING")) return "bg-accent";
  return "bg-text-primary";
}

// Icono en la esquina de cada tarjeta (aparece al pasar el mouse). Va como
// hermano del botón de la tarjeta, no dentro: un <button> no admite otro <button>.
function CopyCardButton({
  state,
  onCopy,
}: {
  state?: CopyState;
  onCopy: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      data-copy-ignore
      onClick={onCopy}
      disabled={state === "copying"}
      title="Copiar tarjeta como imagen"
      className={cn(
        "absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border bg-surface text-text-muted transition-opacity hover:border-accent hover:text-accent focus-visible:opacity-100",
        state ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        state === "error" ? "border-critical text-critical" : "border-border"
      )}
    >
      {state === "done" ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export function StatusBreakdown({
  stats,
  group,
  sortDir,
  onSortDirChange,
  selectedStatus,
  onStatusSelect,
  onRefresh,
  isFetching,
}: {
  stats?: OpenStats;
  group: string;
  sortDir: SortDir;
  onSortDirChange: (d: SortDir) => void;
  selectedStatus: string | null;
  onStatusSelect: (status: string | null) => void;
  onRefresh?: () => void;
  isFetching?: boolean;
}) {
  const byStatus = stats?.byStatus ?? [];
  const showTotal = group !== "ALL";

  const [copy, setCopy] = useState<{ key: string; state: CopyState } | null>(null);

  async function copyCard(key: string, label: string, e: MouseEvent<HTMLButtonElement>) {
    const card = e.currentTarget.parentElement;
    if (!card || copy?.state === "copying") return;
    setCopy({ key, state: "copying" });
    let state: CopyState | null = "done";
    try {
      const slug = `${group}-${label}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      // minWidth: en una tarjeta angosta el nombre del estatus saldría cortado ("PENDING CUS…")
      const res = await copyElementAsImage(card, `estatus-${slug}.png`, { padding: 10, minWidth: 240 });
      // "downloaded" = el navegador no dejó usar el portapapeles; igual se bajó el PNG
      if (res === "downloaded") state = null;
    } catch (err) {
      console.error("No se pudo copiar la tarjeta de estatus", err);
      state = "error";
    }
    setCopy(state ? { key, state } : null);
    if (state) setTimeout(() => setCopy((c) => (c?.key === key ? null : c)), 1500);
  }

  const sortBtn = (dir: SortDir, label: string, Icon: typeof ArrowDownWideNarrow) => (
    <button
      type="button"
      onClick={() => onSortDirChange(dir)}
      title={`Ordenar tabla y Excel por apertura: ${label}`}
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
        sortDir === dir
          ? "bg-accent text-white"
          : "border border-border text-text-muted hover:text-text-primary"
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );

  const total = stats?.totalIncidents || 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Por estatus</h2>
        <div className="flex items-center gap-1.5">
          <span className="mr-1 hidden text-[11px] text-text-muted sm:inline">Orden:</span>
          {sortBtn("desc", "Reciente → antiguo", ArrowDownWideNarrow)}
          {sortBtn("asc", "Antiguo → reciente", ArrowUpNarrowWide)}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isFetching}
              title="Actualizar ahora"
              className="ml-1 flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
          )}
        </div>
      </div>

      {byStatus.length === 0 && !showTotal ? (
        <p className="rounded-xl border border-border/60 bg-surface/40 p-4 text-center text-xs text-text-muted">
          Sin datos de estatus
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {showTotal && (
            <div className="group relative">
              <button
                type="button"
                onClick={() => onStatusSelect(selectedStatus === ALL_STATUS ? null : ALL_STATUS)}
                title="Ver todos los incidentes abiertos"
                className={cn(
                  "flex h-full w-full flex-col gap-1.5 rounded-lg border px-3 py-2 text-left backdrop-blur-md transition-all",
                  selectedStatus === ALL_STATUS
                    ? "border-warning bg-warning/10 ring-2 ring-warning shadow-[0_0_10px_1px_rgba(245,158,11,0.30)]"
                    : "border-warning/50 bg-warning/5 ring-1 ring-warning/40 hover:border-warning"
                )}
              >
                <div className="flex items-center gap-3">
                  <p className="min-w-0 truncate text-[11px] font-medium uppercase tracking-wider text-warning/90">
                    Abiertos
                  </p>
                  <span className="shrink-0 text-lg font-bold text-warning drop-shadow-[0_0_7px_rgba(245,158,11,0.8)]">
                    {stats?.totalIncidents ?? "—"}
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-warning/15">
                  <div className="h-full w-full rounded-full bg-warning" />
                </div>
              </button>
              <CopyCardButton
                state={copy?.key === ALL_STATUS ? copy.state : undefined}
                onCopy={(e) => void copyCard(ALL_STATUS, "abiertos", e)}
              />
            </div>
          )}
          {byStatus.map(({ status, incidents }) => {
            const isSelected = selectedStatus === status;
            const pct = total > 0 ? Math.min(100, Math.round((incidents / total) * 100)) : 0;
            return (
              <div key={status} className="group relative">
                <button
                  type="button"
                  onClick={() => onStatusSelect(isSelected ? null : status)}
                  title={`Ver incidentes con estatus "${status}"`}
                  className={cn(
                    "flex h-full w-full flex-col gap-1.5 rounded-lg border px-3 py-2 text-left backdrop-blur-md transition-colors",
                    isSelected
                      ? "border-accent bg-accent/10 ring-1 ring-accent"
                      : "border-border/60 bg-surface/60 hover:border-accent/60"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <p className="min-w-0 truncate text-[11px] font-medium uppercase tracking-wider text-text-muted" title={status}>
                      {status}
                    </p>
                    <span className={cn("shrink-0 text-lg font-bold", statusAccent(status))}>{incidents}</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-border/40">
                    <div className={cn("h-full rounded-full", statusBarColor(status))} style={{ width: `${pct}%` }} />
                  </div>
                </button>
                <CopyCardButton
                  state={copy?.key === status ? copy.state : undefined}
                  onCopy={(e) => void copyCard(status, status, e)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
