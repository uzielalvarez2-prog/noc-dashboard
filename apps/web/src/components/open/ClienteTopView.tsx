"use client";

import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Search, X, Star, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { useTheme } from "@/components/layout/ThemeProvider";
import { cn } from "@/lib/utils";
import { OpenIncidentTable } from "./OpenIncidentTable";
import type { SortDir } from "@/lib/exportOpenIncidents";
import type { OpenListResponse } from "@/types/open";

interface ClienteTopStat {
  id: string;
  company: string;
  siglasIm: string;
  serviceRef: string;
  note: string | null;
  openCount: number;
  criticalCount: number;
}

async function fetchClienteTopStats(): Promise<{ clientes: ClienteTopStat[] }> {
  const res = await fetch("/api/clientes-top/stats");
  if (!res.ok) throw new Error("Error al cargar Cliente TOP");
  return res.json();
}

export function ClienteTopView() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<ClienteTopStat | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["clientes-top-stats"],
    queryFn: fetchClienteTopStats,
    refetchInterval: 240_000, // mismo ritmo que el resto de Incidentes abiertos
  });
  const clientes = data?.clientes ?? [];

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/clientes-top/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clientes-top-stats"] });
      setSelected(null);
    },
  });

  const cardCls = (critical: boolean) =>
    cn(
      "group relative w-full rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5",
      critical
        ? isLight
          ? "border-critical/50 bg-critical-dim/40 hover:shadow-md"
          : "border-critical/50 bg-critical-dim shadow-[0_0_16px_-4px_rgba(239,68,68,0.35)] hover:shadow-[0_0_20px_-2px_rgba(239,68,68,0.5)]"
        : isLight
          ? "border-amber-300 bg-amber-50 hover:shadow-md"
          : "border-amber-500/40 bg-amber-500/10 hover:shadow-[0_0_16px_-4px_rgba(245,158,11,0.4)]",
    );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          {clientes.length === 0
            ? "Aún no has marcado ningún cliente como TOP."
            : `${clientes.length} cliente${clientes.length === 1 ? "" : "s"} TOP · ${clientes.reduce((a, c) => a + c.openCount, 0)} incidentes abiertos`}
        </p>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar cliente
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-text-muted">Cargando…</p>
      ) : clientes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/40 p-10 text-center">
          <Star className="mx-auto h-6 w-6 text-text-muted" />
          <p className="mt-3 text-sm text-text-muted">
            Marca un cliente como TOP desde "Agregar cliente" y aquí verás sus incidentes
            abiertos de un vistazo.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {clientes.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c)}
              className={cardCls(c.criticalCount > 0)}
            >
              {c.criticalCount > 0 && (
                <AlertTriangle className="absolute right-3 top-3 h-4 w-4 text-critical" />
              )}
              <p className="truncate pr-5 text-sm font-semibold text-text-primary" title={c.company}>
                {c.company}
              </p>
              <p className="mt-3 text-3xl font-bold text-text-primary">{c.openCount}</p>
              <p className="text-xs text-text-muted">
                {c.openCount === 1 ? "incidente abierto" : "incidentes abiertos"}
              </p>
              {c.criticalCount > 0 && (
                <p className="mt-1 text-xs font-medium text-critical">
                  {c.criticalCount} crítico{c.criticalCount === 1 ? "" : "s"} (&gt;4h)
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <ClienteDetail
          cliente={selected}
          onClose={() => setSelected(null)}
          onRemove={() => removeMutation.mutate(selected.id)}
          removing={removeMutation.isPending}
        />
      )}

      {addOpen && (
        <AddClienteModal
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            qc.invalidateQueries({ queryKey: ["clientes-top-stats"] });
            setAddOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel de detalle: incidentes abiertos del cliente seleccionado, mismas
// columnas que "Todos los incidentes abiertos" (reusa OpenIncidentTable con
// companyFilter en vez de duplicar la tabla).
// ─────────────────────────────────────────────────────────────────────────────
function ClienteDetail({
  cliente,
  onClose,
  onRemove,
  removing,
}: {
  cliente: ClienteTopStat;
  onClose: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  void sortDir; // sin control de orden en este panel por ahora; la tabla lo acepta igual

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-text-primary">
          Incidentes abiertos — <span className="text-accent">{cliente.company}</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-2 py-0.5 text-xs text-text-muted hover:text-text-primary"
        >
          Cerrar
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-critical/40 px-2 py-0.5 text-xs text-critical hover:bg-critical-dim disabled:opacity-50"
        >
          {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Quitar de Cliente TOP
        </button>
      </div>
      <OpenIncidentTable group="ALL" sortDir={sortDir} companyFilter={cliente.company} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal "Agregar cliente": busca sobre los incidentes abiertos de HOY (mismo
// endpoint y búsqueda libre que "Todos los incidentes abiertos") y al elegir
// una fila da de alta esa Empresa en Cliente TOP.
// ─────────────────────────────────────────────────────────────────────────────
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

async function searchOpen(q: string): Promise<OpenListResponse> {
  const p = new URLSearchParams({ q, limit: "20", page: "1" });
  const res = await fetch(`/api/incidents/open?${p.toString()}`);
  if (!res.ok) throw new Error("Error al buscar incidentes");
  return res.json();
}

function AddClienteModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyCompany, setBusyCompany] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ["open-incidents-search", debounced],
    queryFn: () => searchOpen(debounced),
    enabled: debounced.length >= 2,
  });

  // Una fila por empresa (puede haber varios incidentes de la misma empresa).
  const companies = useMemo(() => {
    const rows = data?.data ?? [];
    const seen = new Map<string, { company: string; serviceId: string; siteName: string }>();
    for (const r of rows) {
      if (!seen.has(norm(r.company))) {
        seen.set(norm(r.company), { company: r.company, serviceId: r.serviceId, siteName: r.siteName });
      }
    }
    return [...seen.values()];
  }, [data]);

  async function pick(company: string) {
    setBusyCompany(company);
    setFeedback(null);
    try {
      const res = await fetch("/api/clientes-top", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.duplicate) {
          setFeedback("Ese cliente ya está en tu lista TOP.");
        } else {
          setFeedback(body.error ?? "No se pudo agregar");
        }
        return;
      }
      onAdded();
    } catch {
      setFeedback("Error de conexión");
    } finally {
      setBusyCompany(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-20">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-sm font-semibold text-text-primary">Agregar cliente a TOP</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busca por empresa, sitio o servicio del incidente…"
              className="h-9 w-full rounded-md border border-border bg-background/60 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>

          {feedback && <p className="text-xs text-warning">{feedback}</p>}

          <div className="max-h-80 overflow-y-auto">
            {debounced.length < 2 ? (
              <p className="py-6 text-center text-xs text-text-muted">
                Escribe al menos 2 caracteres para buscar entre los incidentes abiertos.
              </p>
            ) : isFetching ? (
              <p className="py-6 text-center text-xs text-text-muted">Buscando…</p>
            ) : companies.length === 0 ? (
              <p className="py-6 text-center text-xs text-text-muted">Sin coincidencias.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {companies.map((c) => (
                  <li key={c.company}>
                    <button
                      type="button"
                      onClick={() => pick(c.company)}
                      disabled={busyCompany !== null}
                      className="flex w-full items-center justify-between gap-3 px-1 py-2.5 text-left hover:bg-surface-elevated/60 disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-text-primary">{c.company}</span>
                        <span className="block truncate text-xs text-text-muted">
                          {c.serviceId} {c.siteName ? `· ${c.siteName}` : ""}
                        </span>
                      </span>
                      {busyCompany === c.company ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-text-muted" />
                      ) : (
                        <Plus className="h-3.5 w-3.5 shrink-0 text-accent" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
