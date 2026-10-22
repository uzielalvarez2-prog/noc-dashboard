"use client";

import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, X, Loader2 } from "lucide-react";
import type { OpenListResponse } from "@/types/open";
import { norm } from "./clienteTopUtils";

// ─────────────────────────────────────────────────────────────────────────────
// Modal "Agregar cliente": busca sobre los incidentes abiertos de HOY (mismo
// endpoint y búsqueda libre que "Todos los incidentes abiertos") y al elegir
// una fila da de alta esa Empresa en Cliente TOP.
// ─────────────────────────────────────────────────────────────────────────────
async function searchOpen(q: string): Promise<OpenListResponse> {
  const p = new URLSearchParams({ q, limit: "20", page: "1" });
  const res = await fetch(`/api/incidents/open?${p.toString()}`);
  if (!res.ok) throw new Error("Error al buscar incidentes");
  return res.json();
}

export function AddClienteModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Empresa elegida de la búsqueda, pendiente de confirmar con su alias.
  const [picked, setPicked] = useState<{ company: string; serviceId: string; siteName: string } | null>(
    null,
  );
  const [alias, setAlias] = useState("");

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

  async function confirmAdd() {
    if (!picked) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/clientes-top", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: picked.company, note: alias.trim() || undefined }),
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
      setBusy(false);
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

        {picked ? (
          <div className="space-y-3 p-4">
            <div>
              <p className="text-xs text-text-muted">Cliente elegido</p>
              <p className="text-sm font-medium text-text-primary">{picked.company}</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-muted">
                Nombre abreviado para la tarjeta (opcional)
              </label>
              <input
                autoFocus
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder={picked.company}
                maxLength={60}
                className="h-9 w-full rounded-md border border-border bg-background/60 px-3 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
              />
              <p className="mt-1 text-xs text-text-muted">
                Útil cuando el nombre real es muy largo. Si lo dejas vacío, se usa el nombre completo.
              </p>
            </div>

            {feedback && <p className="text-xs text-warning">{feedback}</p>}

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setPicked(null);
                  setAlias("");
                  setFeedback(null);
                }}
                className="rounded-md border border-border px-3 py-2 text-xs font-medium text-text-muted hover:text-text-primary"
              >
                Volver a buscar
              </button>
              <button
                type="button"
                onClick={confirmAdd}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Agregar a Cliente TOP
              </button>
            </div>
          </div>
        ) : (
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
                        onClick={() => setPicked(c)}
                        className="flex w-full items-center justify-between gap-3 px-1 py-2.5 text-left hover:bg-surface-elevated/60"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-text-primary">{c.company}</span>
                          <span className="block truncate text-xs text-text-muted">
                            {c.serviceId} {c.siteName ? `· ${c.siteName}` : ""}
                          </span>
                        </span>
                        <Plus className="h-3.5 w-3.5 shrink-0 text-accent" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
