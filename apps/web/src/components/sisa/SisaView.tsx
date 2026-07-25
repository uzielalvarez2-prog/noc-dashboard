"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, RefreshCw, Loader2, Copy, Check, X } from "lucide-react";
import { cn, formatHpsm } from "@/lib/utils";
import { downloadXLSX } from "@/lib/excelExport";
import { HpsmIncidentId } from "@/components/shared/HpsmIncidentId";
import { buildEdcText } from "@/lib/sisa";

interface SisaItem {
  incidentId: string;
  company: string;
  vendor: string;
  vendorTicket: string;
  status: string;
  assignee: string | null;
  group: string;
  openTime: string;
}

async function fetchSisa(): Promise<{ items: SisaItem[] }> {
  const res = await fetch("/api/sisa");
  if (!res.ok) throw new Error("Error al cargar SISA");
  return res.json();
}

// ── Categoría de estatus → color neón ────────────────────────────────────────
// vendor = rojo · resolved = verde · customer = azul · resto = ámbar.
// (VENDOR se evalúa antes que PENDING para que "Pending Vendor" salga rojo.)
type Cat = "vendor" | "resolved" | "customer" | "other";

function statusCat(status: string): Cat {
  const s = (status ?? "").toUpperCase();
  if (s.includes("RESOLV")) return "resolved";
  if (s.includes("VENDOR")) return "vendor";
  if (s.includes("CUSTOMER")) return "customer";
  return "other";
}

const NEON: Record<Cat, { badge: string; idle: string; active: string; count: string }> = {
  vendor: {
    badge: "text-red-400",
    idle: "border-red-500/40 bg-red-500/5 text-red-300 hover:border-red-500",
    active: "border-red-500 bg-red-500/15 text-red-200 ring-2 ring-red-500 shadow-[0_0_10px_2px_rgba(239,68,68,0.4)]",
    count: "bg-red-500/20 text-red-200",
  },
  resolved: {
    badge: "text-emerald-400",
    idle: "border-emerald-500/40 bg-emerald-500/5 text-emerald-300 hover:border-emerald-500",
    active: "border-emerald-500 bg-emerald-500/15 text-emerald-200 ring-2 ring-emerald-500 shadow-[0_0_10px_2px_rgba(16,185,129,0.4)]",
    count: "bg-emerald-500/20 text-emerald-200",
  },
  customer: {
    badge: "text-blue-400",
    idle: "border-blue-400/40 bg-blue-500/5 text-blue-300 hover:border-blue-400",
    active: "border-blue-400 bg-blue-500/15 text-blue-200 ring-2 ring-blue-400 shadow-[0_0_10px_2px_rgba(96,165,250,0.4)]",
    count: "bg-blue-500/20 text-blue-200",
  },
  other: {
    badge: "text-amber-400",
    idle: "border-amber-500/40 bg-amber-500/5 text-amber-300 hover:border-amber-500",
    active: "border-amber-500 bg-amber-500/15 text-amber-200 ring-2 ring-amber-500 shadow-[0_0_10px_2px_rgba(245,158,11,0.4)]",
    count: "bg-amber-500/20 text-amber-200",
  },
};

function StatusBadge({ status }: { status: string }) {
  return <span className={cn("font-medium", NEON[statusCat(status)].badge)}>{status || "—"}</span>;
}

const EXPORT_COLS = ["Incidente", "Apertura", "Empresa", "CASE", "SISA", "Asignado", "Estatus"];
const COLUMNS = ["Incidente", "Apertura", "Empresa", "CASE", "SISA", "Asignado", "Estatus", "EDC"];

export function SisaView() {
  const [q, setQ] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["sisa"],
    queryFn: fetchSisa,
    refetchInterval: 240_000,
  });

  const items = data?.items ?? [];

  // Base: solo el buscador general. Las tarjetas muestran totales sobre esta
  // base; la selección de estatus/CASE filtra la TABLA de abajo (no las tarjetas).
  const baseQ = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) =>
      [it.incidentId, it.company, it.vendor, it.vendorTicket, it.assignee ?? "", it.status]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [items, q]);

  const statusSegments = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of baseQ) {
      const k = it.status || "—";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);
  }, [baseQ]);

  const caseSegments = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of baseQ) {
      const k = it.vendor || "—";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [baseQ]);

  const filtered = useMemo(
    () =>
      baseQ.filter((it) => {
        if (selectedStatus && (it.status || "—") !== selectedStatus) return false;
        if (selectedCase && (it.vendor || "—") !== selectedCase) return false;
        return true;
      }),
    [baseQ, selectedStatus, selectedCase]
  );

  const hasFilter = selectedStatus !== null || selectedCase !== null;

  async function handleCopyEdc(it: SisaItem) {
    const text = buildEdcText(it);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedId(it.incidentId);
    setTimeout(() => setCopiedId((cur) => (cur === it.incidentId ? null : cur)), 1800);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const rows = filtered.map((it) => [
        it.incidentId,
        formatHpsm(it.openTime),
        it.company,
        it.vendor,
        it.vendorTicket,
        it.assignee ?? "—",
        it.status,
      ]);
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadXLSX(`sisa-${stamp}`, "SISA", EXPORT_COLS, rows);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Segmentación por ESTATUS ─────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-text-primary">Por estatus</h2>
          {hasFilter && (
            <button
              type="button"
              onClick={() => {
                setSelectedStatus(null);
                setSelectedCase(null);
              }}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-muted hover:text-text-primary"
            >
              <X className="h-3 w-3" /> Limpiar filtros
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Total (limpia el filtro de estatus) */}
          <button
            type="button"
            onClick={() => setSelectedStatus(null)}
            title="Ver todos los estatus"
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
              selectedStatus === null
                ? "border-violet-400 bg-violet-500/15 text-violet-200 ring-2 ring-violet-400 shadow-[0_0_10px_2px_rgba(139,92,246,0.4)]"
                : "border-violet-500/40 bg-violet-500/5 text-violet-300 hover:border-violet-400"
            )}
          >
            <span>Tickets SISA</span>
            <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 font-mono text-[10px] text-violet-200">
              {baseQ.length}
            </span>
          </button>

          {statusSegments.map(({ status, count }) => {
            const cat = statusCat(status);
            const isSel = selectedStatus === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setSelectedStatus(isSel ? null : status)}
                title={`Filtrar por estatus "${status}"`}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                  isSel ? NEON[cat].active : NEON[cat].idle
                )}
              >
                <span className="max-w-[14rem] truncate">{status || "—"}</span>
                <span className={cn("rounded-full px-1.5 py-0.5 font-mono text-[10px]", NEON[cat].count)}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Segmentación por CASE ────────────────────────────────────────── */}
      {caseSegments.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-text-primary">Por CASE</h2>
          <div className="flex flex-wrap gap-2">
            {caseSegments.map(({ name, count }) => {
              const isSel = selectedCase === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSelectedCase(isSel ? null : name)}
                  title={`Filtrar por CASE "${name}"`}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                    isSel
                      ? "border-violet-400 bg-violet-500/10 text-violet-200 ring-2 ring-violet-400 shadow-[0_0_10px_2px_rgba(139,92,246,0.4)]"
                      : "border-border/60 bg-surface/60 text-text-primary hover:border-violet-400/60"
                  )}
                >
                  <span className="max-w-[14rem] truncate">{name}</span>
                  <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 font-mono text-[10px] text-violet-200">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tabla ────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border/60 bg-surface/40 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-surface/80 p-2 backdrop-blur-md">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por incidente, empresa, CASE, SISA, asignado o estatus…"
              className="h-9 w-full rounded-md border border-border bg-background/60 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>
          <span className="hidden whitespace-nowrap font-mono text-xs text-text-muted sm:block">
            {filtered.length}
            {hasFilter ? ` / ${baseQ.length}` : ""} tickets
          </span>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            title="Descargar Excel"
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-2 text-xs font-medium text-text-muted hover:text-text-primary disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Excel</span>
          </button>
          <button
            type="button"
            onClick={() => void refetch()}
            title="Actualizar"
            className="rounded-md border border-border bg-surface p-2 text-text-muted hover:text-text-primary"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface-elevated/80 backdrop-blur-md">
              <tr>
                {COLUMNS.map((h) => (
                  <th
                    key={h}
                    className="border-b border-border/60 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-12 text-center text-sm text-text-muted">Cargando…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-12 text-center text-sm text-text-muted">
                    {q || hasFilter
                      ? "Sin resultados para el filtro actual"
                      : "Sube un CSV de SISA (o no hay coincidencias con incidentes abiertos)"}
                  </td>
                </tr>
              ) : (
                filtered.map((it) => (
                  <tr
                    key={it.incidentId}
                    className="border-b border-border/40 transition-colors hover:bg-surface-elevated/40"
                  >
                    <td className="px-3 py-2">
                      <HpsmIncidentId incidentId={it.incidentId} className="font-mono text-xs text-text-muted" />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-text-muted">{formatHpsm(it.openTime)}</td>
                    <td className="px-3 py-2 text-xs text-text-primary">
                      <span className="block max-w-[16rem] truncate" title={it.company}>
                        {it.company || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-text-primary">{it.vendor || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-accent">{it.vendorTicket || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-text-muted">{it.assignee ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      <StatusBadge status={it.status} />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => void handleCopyEdc(it)}
                        title="Copiar formato EDC al portapapeles"
                        className={cn(
                          "flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                          copiedId === it.incidentId
                            ? "border-success/50 bg-success/10 text-success"
                            : "border-violet-500/50 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
                        )}
                      >
                        {copiedId === it.incidentId ? (
                          <>
                            <Check className="h-3.5 w-3.5" /> Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" /> EDC
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
