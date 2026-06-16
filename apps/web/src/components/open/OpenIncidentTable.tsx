"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Search, ChevronLeft, ChevronRight, RefreshCw, Star, Download } from "lucide-react";
import type { OpenListResponse } from "@/types/open";
import { fetchEscalated, type EscalatedResponse } from "@/components/dashboard/EscalatedPanel";
import { cn, formatDate, formatHpsm } from "@/lib/utils";
import { downloadXLSX } from "@/lib/excelExport";

const COLUMNS = [
  { key: "incidentId", label: "Incident ID" },
  { key: "company", label: "Empresa" },
  { key: "serviceId", label: "Servicio" },
  { key: "state", label: "Estado" },
  { key: "district", label: "Distrito" },
  { key: "assignee", label: "Asignado" },
  { key: "status", label: "Estatus" },
  { key: "group", label: "Grupo" },
] as const;

async function fetchOpen(qs: string): Promise<OpenListResponse> {
  const res = await fetch(`/api/incidents/open?${qs}`);
  if (!res.ok) throw new Error("Error al obtener incidentes");
  return res.json();
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const color = s.includes("RESOLVED")
    ? "text-success"
    : s.includes("PROGRESS")
    ? "text-warning"
    : s.includes("PENDING")
    ? "text-accent"
    : "text-text-muted";
  return <span className={cn("font-medium", color)}>{status || "—"}</span>;
}

function GroupBadge({ group }: { group: string }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-semibold",
        group === "PEXA" ? "bg-accent/15 text-accent" : "bg-warning/15 text-warning"
      )}
    >
      {group}
    </span>
  );
}

export function OpenIncidentTable({ group }: { group: string }) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const limit = 50;
  const qc = useQueryClient();

  // Marcas de atención especial (escalados) — compartidas con el panel del Overview
  const { data: escalated } = useQuery<EscalatedResponse>({
    queryKey: ["escalated"],
    queryFn: fetchEscalated,
    refetchInterval: 60_000,
  });
  const markedSet = new Set(escalated?.marked ?? []);

  const toggleEscalated = useMutation({
    mutationFn: async ({ incidentId, value }: { incidentId: string; value: boolean }) => {
      await fetch("/api/incidents/escalated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId, escalated: value }),
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["escalated"] }),
  });

  // Debounce del buscador para no pegarle al servidor en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [group]);

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (group !== "ALL") params.set("group", group);
  params.set("collapse", "false"); // 1 fila por sitio: Estado/Distrito reales, sin "Varios"
  params.set("page", String(page));
  params.set("limit", String(limit));
  const qs = params.toString();

  const { data, isLoading, isFetching, refetch } = useQuery<OpenListResponse>({
    queryKey: ["open-incidents", qs],
    queryFn: () => fetchOpen(qs),
    refetchInterval: 240_000, // refresco cada 4 min
    placeholderData: keepPreviousData,
  });

  // Descarga TODO lo que coincide con el filtro/búsqueda actual (no solo la
  // página visible), paginando contra el API hasta juntar el total. El .xlsx
  // sale como Tabla de Excel, listo para "Insertar > Tabla dinámica".
  async function handleExport() {
    setExporting(true);
    try {
      const base = new URLSearchParams();
      if (q) base.set("q", q);
      if (group !== "ALL") base.set("group", group);
      base.set("collapse", "false");
      const all: OpenListResponse["data"] = [];
      const pageSize = 500;
      let p = 1;
      for (;;) {
        const sp = new URLSearchParams(base);
        sp.set("page", String(p));
        sp.set("limit", String(pageSize));
        const res = await fetchOpen(sp.toString());
        all.push(...res.data);
        if (res.data.length === 0 || all.length >= res.meta.total) break;
        p++;
      }
      const headers = [...COLUMNS.map((c) => c.label), "Apertura"];
      const exportRows = all.map((r) => [
        r.incidentId,
        r.company,
        r.serviceId,
        r.state,
        r.district,
        r.assignee ?? "",
        r.status,
        r.group,
        formatHpsm(r.openTime),
      ]);
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadXLSX(
        `incidentes-abiertos-${group.toLowerCase()}-${stamp}`,
        "Abiertos",
        headers,
        exportRows,
      );
    } finally {
      setExporting(false);
    }
  }

  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0; // ahora cuenta incidentes (1 fila por IM)
  const unique = data?.meta.uniqueIncidents ?? 0;
  const totalSites = data?.meta.totalSites ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const lastSync = data?.meta.lastSync;

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-surface/40 backdrop-blur-md">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-collapse text-sm">
          {/* El thead es sticky: el buscador (fila 1) y los títulos (fila 2) se
              quedan fijos al hacer scroll, justo como pediste. */}
          <thead className="sticky top-0 z-20">
            <tr>
              <th
                colSpan={COLUMNS.length + 2}
                className="border-b border-border/60 bg-surface/80 p-2 backdrop-blur-md"
              >
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por ID, empresa, servicio, estado, distrito, asignado, estatus…"
                      className="h-9 w-full rounded-md border border-border bg-background/60 pl-9 pr-3 text-sm font-normal normal-case tracking-normal text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                  <span className="hidden whitespace-nowrap font-mono text-xs font-normal text-text-muted sm:block">
                    {unique} inc · {totalSites} sitios
                  </span>
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={exporting}
                    title="Descargar Excel (tabla dinámica)"
                    className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-2 text-xs font-medium text-text-muted hover:text-text-primary disabled:opacity-50"
                  >
                    <Download className={cn("h-3.5 w-3.5", exporting && "animate-pulse")} />
                    <span className="hidden sm:inline">{exporting ? "Generando…" : "Excel"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => refetch()}
                    title="Actualizar"
                    className="rounded-md border border-border bg-surface p-2 text-text-muted hover:text-text-primary"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
                  </button>
                </div>
              </th>
            </tr>
            <tr className="bg-surface-elevated/80 backdrop-blur-md">
              <th
                title="Marcar para atención especial"
                className="w-8 border-b border-border/60 px-2 py-2 text-center"
              >
                <Star className="mx-auto h-3.5 w-3.5 text-warning" />
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="border-b border-border/60 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-muted"
                >
                  {c.label}
                </th>
              ))}
              <th className="border-b border-border/60 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                Apertura
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="py-12 text-center text-sm text-text-muted">
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="py-12 text-center text-sm text-text-muted">
                  {q ? "Sin resultados para tu búsqueda" : "Sube un CSV de abiertos para empezar"}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    "border-b border-border/40 transition-colors",
                    markedSet.has(r.incidentId)
                      ? "bg-warning/10 hover:bg-warning/15"
                      : "hover:bg-surface-elevated/40"
                  )}
                >
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      title="Atención especial"
                      checked={markedSet.has(r.incidentId)}
                      onChange={(e) =>
                        toggleEscalated.mutate({
                          incidentId: r.incidentId,
                          value: e.target.checked,
                        })
                      }
                      className="h-3.5 w-3.5 cursor-pointer accent-[#f59e0b]"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">{r.incidentId}</td>
                  <td className="px-3 py-2 text-xs text-text-primary">
                    <span className="block max-w-[12rem] truncate" title={r.company}>
                      {r.company}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">{r.serviceId}</td>
                  <td className="px-3 py-2 text-xs text-text-primary">{r.state}</td>
                  <td className="px-3 py-2 text-xs text-text-primary">{r.district}</td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">{r.assignee ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2">
                    <GroupBadge group={r.group} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">{formatHpsm(r.openTime)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border/60 bg-surface/60 px-3 py-2 text-xs text-text-muted backdrop-blur-md">
        <span>
          {total > 0
            ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} de ${total} sitios · ${unique} incidentes`
            : "0 sitios"}
          {/* uploadedAt sí es UTC real (lo pone la DB), no "reloj de pared" HPSM */}
          {lastSync && <span className="ml-2">· última carga {formatDate(lastSync)}</span>}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded p-1 hover:text-text-primary disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded p-1 hover:text-text-primary disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
