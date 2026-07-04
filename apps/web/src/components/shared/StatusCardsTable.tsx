"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Flag, X, Check, Pencil, Search, Download, Loader2 } from "lucide-react";
import { cn, formatHpsmExcel } from "@/lib/utils";
import { downloadXLSX } from "@/lib/excelExport";
import { HpsmIncidentId } from "@/components/shared/HpsmIncidentId";

export interface StatusCardItem {
  incidentId: string;
  openTime: string | null;
  status: string;
  company: string;
  serviceId: string;
  state: string;
  district: string;
  assignee: string | null;
  flagged: boolean;
  note: string;
  recurrence?: number;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function statusAccent(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("RESOLV") || s.includes("RESUELT")) return "text-success";
  if (s.includes("PROGRESS")) return "text-warning";
  if (s.includes("PENDING")) return "text-accent";
  return "text-text-primary";
}

// Colores NEÓN por estatus (EDC): Vendor = rojo, Resolved = verde,
// Work in progress = ámbar, el resto = azul.
function statusNeon(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("VENDOR")) return "text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]";
  if (s.includes("RESOLV") || s.includes("RESUELT")) return "text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.9)]";
  if (s.includes("PROGRESS")) return "text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]";
  return "text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.9)]";
}

// Pastilla de estatus (dentro de la tabla) en el mismo esquema NEÓN que las
// tarjetas: Vendor rojo, Resolved verde, Work in progress ámbar, resto azul.
function statusBadgeNeon(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("VENDOR")) return "border-red-500/50 bg-red-500/10 text-red-400";
  if (s.includes("RESOLV") || s.includes("RESUELT")) return "border-green-500/50 bg-green-500/10 text-green-400";
  if (s.includes("PROGRESS")) return "border-amber-500/50 bg-amber-500/10 text-amber-400";
  return "border-blue-500/50 bg-blue-500/10 text-blue-400";
}

function NoteCell({ value, onSave }: { value: string; onSave: (note: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onSave(draft); setEditing(false); }
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
          placeholder="Nota..."
          className="w-40 rounded border border-border bg-surface px-1.5 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
        />
        <button onClick={() => { onSave(draft); setEditing(false); }} title="Guardar" className="text-success hover:opacity-80">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => { setDraft(value); setEditing(false); }} title="Cancelar" className="text-text-muted hover:text-text-primary">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Editar nota"
      className="group flex max-w-[12rem] items-center gap-1 text-left text-xs text-text-muted hover:text-text-primary"
    >
      <span className="truncate">{value || "—"}</span>
      <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  );
}

const EXPORT_COLS = ["Incident ID", "Apertura", "Estatus", "Empresa", "Servicio", "Estado", "Asignado", "Distrito"];

export function StatusCardsTable({
  items,
  isLoading,
  totalLabel,
  onPatch,
  fileBase,
  alwaysShowTable = false,
  neonStatus = false,
}: {
  items: StatusCardItem[];
  isLoading: boolean;
  totalLabel: string;
  onPatch: (it: StatusCardItem, body: Partial<{ flagged: boolean; note: string; dismissed: boolean }>) => void;
  fileBase: string;
  // Si true, la tabla se muestra siempre (aunque no haya una tarjeta de estatus
  // seleccionada); sin selección muestra todos los items.
  alwaysShowTable?: boolean;
  // Si true, el número de cada tarjeta de estatus usa el esquema NEÓN
  // (Vendor rojo / Resolved verde / Progress ámbar / resto azul).
  neonStatus?: boolean;
}) {
  const statusColor = neonStatus ? statusNeon : statusAccent;
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      const key = it.status || "—";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([status, count]) => ({ status, count }));
  }, [items]);

  const filtered = useMemo(() => {
    let base = items;
    if (selectedStatus) base = base.filter((it) => (it.status || "—") === selectedStatus);
    const needle = q.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((it) =>
      [it.incidentId, it.status, it.company, it.serviceId, it.state, it.district, it.assignee ?? "", it.note]
        .join(" ").toLowerCase().includes(needle)
    );
  }, [items, selectedStatus, q]);

  async function handleExport() {
    setExporting(true);
    try {
      const rows = filtered.map((it) => [
        it.incidentId,
        it.openTime ? formatHpsmExcel(it.openTime) : "—",
        it.status,
        it.company,
        it.serviceId,
        it.state,
        it.assignee ?? "—",
        it.district,
      ]);
      const stamp = new Date().toISOString().slice(0, 10);
      const label = selectedStatus ?? "todos";
      await downloadXLSX(`${fileBase}-${label.toLowerCase().replace(/\s+/g, "-")}-${stamp}`, "Incidentes", EXPORT_COLS, rows);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {alwaysShowTable ? (
          // Tarjeta del total clicable: quita el filtro de estatus y muestra
          // TODOS los incidentes en la tabla. Activa cuando no hay estatus elegido.
          <button
            type="button"
            onClick={() => setSelectedStatus(null)}
            title="Ver todos los estatus"
            className={cn(
              "group flex flex-col items-start rounded-xl border p-4 text-left backdrop-blur-md transition-all",
              selectedStatus === null
                ? "border-warning bg-warning/10 ring-2 ring-warning shadow-[0_0_14px_2px_rgba(245,158,11,0.30)]"
                : "border-warning/50 bg-warning/5 ring-1 ring-warning/40 shadow-[0_0_14px_2px_rgba(245,158,11,0.30)] hover:border-warning"
            )}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <p className="truncate text-xs font-medium uppercase tracking-wider text-warning/90">{totalLabel}</p>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-all",
                  selectedStatus === null ? "rotate-180 text-warning" : "text-warning/40 group-hover:text-warning"
                )}
              />
            </div>
            <p className="mt-1 text-2xl font-bold text-warning drop-shadow-[0_0_7px_rgba(245,158,11,0.8)]">{items.length}</p>
            <p className="mt-0.5 text-xs text-text-muted">únicos</p>
          </button>
        ) : (
          <div className="flex flex-col items-start rounded-xl border border-warning/50 bg-warning/5 p-4 ring-1 ring-warning/40 shadow-[0_0_14px_2px_rgba(245,158,11,0.30)] backdrop-blur-md">
            <p className="truncate text-xs font-medium uppercase tracking-wider text-warning/90">{totalLabel}</p>
            <p className="mt-1 text-2xl font-bold text-warning drop-shadow-[0_0_7px_rgba(245,158,11,0.8)]">{items.length}</p>
            <p className="mt-0.5 text-xs text-text-muted">únicos</p>
          </div>
        )}
        {byStatus.map(({ status, count }) => {
          const isSelected = selectedStatus === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setSelectedStatus(isSelected ? null : status)}
              title={`Ver incidentes con estatus "${status}"`}
              className={cn(
                "group flex flex-col items-start rounded-xl border p-4 text-left backdrop-blur-md transition-colors",
                isSelected
                  ? "border-accent bg-accent/10 ring-1 ring-accent"
                  : "border-border/60 bg-surface/60 hover:border-accent/60"
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <p className="truncate text-xs font-medium uppercase tracking-wider text-text-muted" title={status}>
                  {status}
                </p>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-all",
                    isSelected ? "rotate-180 text-accent" : "text-text-muted/40 group-hover:text-accent"
                  )}
                />
              </div>
              <p className={cn("mt-1 text-2xl font-bold", statusColor(status))}>{count}</p>
              <p className="mt-0.5 text-xs text-text-muted">incidentes</p>
            </button>
          );
        })}
      </div>

      {(selectedStatus || alwaysShowTable) && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-text-primary">
                Incidentes — <span className="text-accent">{selectedStatus ?? "Todos"}</span>
              </h2>
              {selectedStatus && (
                <button
                  type="button"
                  onClick={() => setSelectedStatus(null)}
                  className="rounded-md border border-border px-2 py-0.5 text-xs text-text-muted hover:text-text-primary"
                >
                  Cerrar
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar..."
                  className="rounded-md border border-border bg-surface py-1.5 pl-7 pr-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                title="Descargar Excel"
                className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-text-primary disabled:opacity-50"
              >
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Excel
              </button>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {["Nota", "Quitar", "🚩", "Incidente", "Apertura", "Estatus", "Empresa", "Servicio", "Estado", "Asignado", "Distrito"].map((h) => (
                    <th key={h} className="sticky top-0 z-10 border-b border-border bg-surface-elevated px-3 py-2.5 text-left text-xs font-medium text-text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-sm text-text-muted">Cargando...</td></tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-sm text-text-muted">Sin coincidencias</td></tr>
                )}
                {filtered.map((it) => {
                  const rowText = it.flagged ? "text-critical" : "text-text-primary";
                  return (
                    <tr key={it.incidentId} className="border-b border-border transition-colors last:border-0 hover:bg-surface-elevated/40">
                      <td className="px-3 py-2.5">
                        <NoteCell value={it.note} onSave={(note) => onPatch(it, { note })} />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button onClick={() => onPatch(it, { dismissed: true })} title="Quitar" className="text-text-muted/50 transition-colors hover:text-critical">
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button onClick={() => onPatch(it, { flagged: !it.flagged })} title={it.flagged ? "Quitar bandera" : "Marcar"} className={it.flagged ? "text-critical" : "text-text-muted/50 hover:text-text-muted"}>
                          <Flag className={cn("h-4 w-4", it.flagged && "fill-critical")} />
                        </button>
                      </td>
                      <td className={cn("px-3 py-2.5 font-mono text-xs font-semibold", rowText)}>
                        <HpsmIncidentId incidentId={it.incidentId} />
                        {!!it.recurrence && it.recurrence > 1 && (
                          <span title={`${it.recurrence} caídas en 7 días`} className="ml-1.5 rounded bg-warning/15 px-1 text-[10px] font-bold text-warning">
                            ⟳{it.recurrence}
                          </span>
                        )}
                      </td>
                      <td className={cn("whitespace-nowrap px-3 py-2.5 text-xs", rowText)}>{fmt(it.openTime)}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn("inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold",
                          neonStatus
                            ? statusBadgeNeon(it.status)
                            : it.flagged
                            ? "border-critical/40 bg-critical-dim text-critical"
                            : "border-warning/40 bg-warning-dim text-warning"
                        )}>
                          {it.status || "—"}
                        </span>
                      </td>
                      <td className={cn("px-3 py-2.5", rowText)}>{it.company || "—"}</td>
                      <td className={cn("px-3 py-2.5 font-mono text-xs", rowText)}>
                        <div className="max-w-[11rem] truncate" title={it.serviceId}>{it.serviceId || "—"}</div>
                      </td>
                      <td className={cn("px-3 py-2.5 text-xs", rowText)}>{it.state || "—"}</td>
                      <td className={cn("px-3 py-2.5 text-xs", rowText)}>{it.assignee || "—"}</td>
                      <td className={cn("px-3 py-2.5 text-xs", rowText)}>{it.district || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
