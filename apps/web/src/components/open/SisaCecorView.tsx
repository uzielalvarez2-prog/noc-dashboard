"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, RefreshCw, Copy, Check } from "lucide-react";
import type { OpenListResponse } from "@/types/open";
import { cn, formatHpsm } from "@/lib/utils";
import { HpsmIncidentId } from "@/components/shared/HpsmIncidentId";
import { extractSisaFromSummary, buildEdcTextCecor } from "@/lib/sisaCecor";

async function fetchAllCecor(): Promise<OpenListResponse> {
  const params = new URLSearchParams({ group: "CECOR", limit: "200", page: "1" });
  const res = await fetch(`/api/incidents/open?${params.toString()}`);
  if (!res.ok) throw new Error("Error al obtener incidentes CECOR");
  return res.json();
}

const COLUMNS = [
  "Incident ID",
  "Apertura",
  "Empresa",
  "Servicio",
  "Estado",
  "Distrito",
  "Asignado",
  "Estatus",
  "Grupo",
  "EDC",
];

export function SisaCecorView() {
  const [q, setQ] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery<OpenListResponse>({
    queryKey: ["open-incidents", "CECOR", "sisa-cecor-all"],
    queryFn: fetchAllCecor,
    refetchInterval: 240_000,
  });

  // Solo incidentes con un folio SISA detectable dentro de Summary.
  const withSisa = useMemo(
    () => (data?.data ?? []).filter((r) => extractSisaFromSummary(r.summary) !== null),
    [data]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return withSisa;
    return withSisa.filter((r) =>
      [r.incidentId, r.company, r.serviceId, r.state, r.district, r.assignee ?? "", r.status, r.group]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [withSisa, q]);

  async function handleCopy(incidentId: string, summary: string | null) {
    const text = buildEdcTextCecor({ incidentId, summary });
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
    setCopiedId(incidentId);
    setTimeout(() => setCopiedId((cur) => (cur === incidentId ? null : cur)), 1800);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-surface/40 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-surface/80 p-2 backdrop-blur-md">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por ID, empresa, servicio, estado, distrito, asignado, estatus…"
            className="h-9 w-full rounded-md border border-border bg-background/60 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <span className="hidden whitespace-nowrap font-mono text-xs text-text-muted sm:block">
          {filtered.length} con SISA
        </span>
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
                <td colSpan={COLUMNS.length} className="py-12 text-center text-sm text-text-muted">
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-12 text-center text-sm text-text-muted">
                  {q ? "Sin resultados para tu búsqueda" : "Ningún incidente CECOR trae SISA en Summary todavía"}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/40 transition-colors hover:bg-surface-elevated/40">
                  <td className="px-3 py-2">
                    <HpsmIncidentId incidentId={r.incidentId} className="font-mono text-xs text-text-muted" />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">{formatHpsm(r.openTime)}</td>
                  <td className="px-3 py-2 text-xs text-text-primary">
                    <span className="block max-w-[12rem] truncate" title={r.company}>
                      {r.company || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">
                    <span className="block max-w-[11rem] truncate" title={r.serviceId}>
                      {r.serviceId || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-text-primary">{r.state || "—"}</td>
                  <td className="px-3 py-2 text-xs text-text-primary">{r.district || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">{r.assignee ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-text-primary">{r.status || "—"}</td>
                  <td className="px-3 py-2 text-xs text-text-primary">{r.group}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => void handleCopy(r.incidentId, r.summary)}
                      title="Copiar formato EDC al portapapeles"
                      className={cn(
                        "flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                        copiedId === r.incidentId
                          ? "border-success/50 bg-success/10 text-success"
                          : "border-violet-500/50 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
                      )}
                    >
                      {copiedId === r.incidentId ? (
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
  );
}
