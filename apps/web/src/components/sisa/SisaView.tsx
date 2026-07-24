"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadXLSX } from "@/lib/excelExport";
import { HpsmIncidentId } from "@/components/shared/HpsmIncidentId";

interface SisaItem {
  incidentId: string;
  company: string;
  vendor: string;
  vendorTicket: string;
  status: string;
  assignee: string | null;
  group: string;
}

async function fetchSisa(): Promise<{ items: SisaItem[] }> {
  const res = await fetch("/api/sisa");
  if (!res.ok) throw new Error("Error al cargar SISA");
  return res.json();
}

const EXPORT_COLS = ["Incidente", "Empresa", "CASE", "SISA", "Asignado"];

export function SisaView() {
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["sisa"],
    queryFn: fetchSisa,
    refetchInterval: 240_000,
  });

  const items = data?.items ?? [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) =>
      [it.incidentId, it.company, it.vendor, it.vendorTicket, it.assignee ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [items, q]);

  async function handleExport() {
    setExporting(true);
    try {
      const rows = filtered.map((it) => [
        it.incidentId,
        it.company,
        it.vendor,
        it.vendorTicket,
        it.assignee ?? "—",
      ]);
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadXLSX(`sisa-${stamp}`, "SISA", EXPORT_COLS, rows);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-surface/40 backdrop-blur-md">
      <div className="flex items-center gap-3 border-b border-border/60 bg-surface/80 p-2 backdrop-blur-md">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por incidente, empresa, CASE, SISA o asignado…"
            className="h-9 w-full rounded-md border border-border bg-background/60 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <span className="hidden whitespace-nowrap font-mono text-xs text-text-muted sm:block">
          {filtered.length} tickets
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
              {["Incidente", "Empresa", "CASE", "SISA", "Asignado"].map((h) => (
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
                <td colSpan={5} className="py-12 text-center text-sm text-text-muted">Cargando…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-text-muted">
                  {q
                    ? "Sin resultados para tu búsqueda"
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
                  <td className="px-3 py-2 text-xs text-text-primary">
                    <span className="block max-w-[16rem] truncate" title={it.company}>
                      {it.company || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-text-primary">{it.vendor || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-accent">{it.vendorTicket || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">{it.assignee ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
