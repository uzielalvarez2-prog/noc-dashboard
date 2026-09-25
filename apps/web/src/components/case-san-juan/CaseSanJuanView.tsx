"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { HpsmIncidentId } from "@/components/shared/HpsmIncidentId";
import { CaseNotasPanel, formatNotaFecha, type CaseNota } from "@/components/case-san-juan/CaseNotasPanel";

interface CaseItem {
  incidentId: string;
  openTime: string;
  company: string;
  serviceId: string;
  siteName: string;
  vendorTicket: string;
  status: string;
  notas: CaseNota[];
}

interface CaseResponse {
  items: CaseItem[];
  puedeEditar: boolean;
  abreHpsm: boolean;
}

async function fetchCase(): Promise<CaseResponse> {
  const res = await fetch("/api/case-san-juan");
  const body = (await res.json().catch(() => ({}))) as Partial<CaseResponse> & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Error al leer CASE San Juan");
  return { items: body.items ?? [], puedeEditar: body.puedeEditar ?? false, abreHpsm: body.abreHpsm ?? false };
}

const COLUMNS = ["", "SISA", "Empresa", "Servicio", "Sitio", "Incidente", "Estatus", "Estatus CASE"];

// Mismo código de color que la vista SISA: vendor rojo · resolved verde ·
// customer azul · resto ámbar.
function statusClass(status: string): string {
  const s = (status ?? "").toUpperCase();
  if (s.includes("RESOLV")) return "text-emerald-400";
  if (s.includes("VENDOR")) return "text-red-400";
  if (s.includes("CUSTOMER")) return "text-blue-400";
  return "text-amber-400";
}

export function CaseSanJuanView() {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  // Orden por Estatus: clic en el encabezado cicla A→Z, Z→A y sin orden
  // (sin orden = por apertura, más viejo primero, como llega de la API).
  const [ordenEstatus, setOrdenEstatus] = useState<"asc" | "desc" | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["case-san-juan"],
    queryFn: fetchCase,
    refetchInterval: 30_000,
  });

  const items = data?.items ?? [];
  const puedeEditar = data?.puedeEditar ?? false;
  const abreHpsm = data?.abreHpsm ?? false;

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const lista = needle
      ? items.filter((it) =>
          [it.vendorTicket, it.company, it.serviceId, it.siteName, it.incidentId, it.status]
            .join(" ")
            .toLowerCase()
            .includes(needle)
        )
      : items;
    if (!ordenEstatus) return lista;
    const dir = ordenEstatus === "asc" ? 1 : -1;
    // sort estable: dentro del mismo estatus se conserva el orden por apertura.
    return [...lista].sort((a, b) => dir * (a.status ?? "").localeCompare(b.status ?? "", "es"));
  }, [items, q, ordenEstatus]);

  function ciclarOrdenEstatus() {
    setOrdenEstatus((o) => (o === null ? "asc" : o === "asc" ? "desc" : null));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por SISA, empresa, servicio, sitio, incidente o estatus…"
            className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-3 text-xs text-text-primary"
          />
        </div>
        <span className="shrink-0 text-xs text-text-muted">{filtrados.length} incidentes</span>
      </div>

      {error && <p className="text-xs text-critical">{(error as Error).message}</p>}

      <div className="max-h-[75vh] overflow-auto rounded-lg border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface-elevated/80 backdrop-blur-md">
            <tr>
              {COLUMNS.map((h, i) => (
                <th
                  key={i}
                  className="border-b border-border/60 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-muted"
                >
                  {h === "Estatus" ? (
                    <button
                      type="button"
                      onClick={ciclarOrdenEstatus}
                      title="Ordenar por estatus (A→Z, Z→A, sin orden)"
                      className={cn(
                        "flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-text-primary",
                        ordenEstatus && "text-accent"
                      )}
                    >
                      {h}
                      {ordenEstatus === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : ordenEstatus === "desc" ? (
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3" />
                      )}
                    </button>
                  ) : (
                    h
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-12 text-center text-sm text-text-muted">Cargando…</td>
              </tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-12 text-center text-sm text-text-muted">
                  {q ? "Sin resultados para la búsqueda" : "No hay incidentes abiertos del CASE San Juan"}
                </td>
              </tr>
            ) : (
              filtrados.map((it) => {
                const expandido = abierto === it.incidentId;
                const ultima = it.notas[0];
                return (
                  <Fragment key={it.incidentId}>
                    <tr
                      onClick={() => setAbierto(expandido ? null : it.incidentId)}
                      className={cn(
                        "cursor-pointer border-b border-border/40 transition-colors hover:bg-surface-elevated/40",
                        expandido && "bg-surface-elevated/40"
                      )}
                    >
                      <td className="px-2 py-2 text-text-muted">
                        {expandido ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-accent">{it.vendorTicket || "—"}</td>
                      <td className="px-3 py-2 text-xs text-text-primary">
                        <span className="block max-w-[14rem] truncate" title={it.company}>{it.company || "—"}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-text-muted">
                        <span className="block max-w-[11rem] truncate" title={it.serviceId}>{it.serviceId || "—"}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-text-primary">
                        <span className="block max-w-[12rem] truncate" title={it.siteName}>{it.siteName || "—"}</span>
                      </td>
                      {abreHpsm ? (
                        // El doble clic abre HPSM: no debe abrir/cerrar la bitácora.
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <HpsmIncidentId incidentId={it.incidentId} className="font-mono text-xs text-text-muted" />
                        </td>
                      ) : (
                        <td className="px-3 py-2 font-mono text-xs text-text-muted">{it.incidentId}</td>
                      )}
                      <td className={cn("px-3 py-2 text-xs font-medium", statusClass(it.status))}>{it.status || "—"}</td>
                      <td className="px-3 py-2 text-xs">
                        {ultima ? (
                          <div className="max-w-[22rem]">
                            <span className="block truncate text-text-primary" title={ultima.texto}>{ultima.texto}</span>
                            <span className="text-[11px] text-text-muted">
                              {formatNotaFecha(ultima.createdAt)} · {ultima.autor}
                              {it.notas.length > 1 && ` · ${it.notas.length} notas`}
                            </span>
                          </div>
                        ) : (
                          <span className="text-text-muted">{puedeEditar ? "Agregar nota…" : "—"}</span>
                        )}
                      </td>
                    </tr>
                    {expandido && (
                      <tr className="border-b border-border/40 bg-surface-elevated/20">
                        <td colSpan={COLUMNS.length} className="px-6 py-3">
                          <CaseNotasPanel
                            incidentId={it.incidentId}
                            notas={it.notas}
                            puedeEditar={puedeEditar}
                            onGuardada={refetch}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
