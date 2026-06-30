"use client";

import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Search, Loader2, X } from "lucide-react";
import type { OpenListResponse, OpenIncidentRow } from "@/types/open";
import { cn, formatHpsm } from "@/lib/utils";

const MIN_CHARS = 2;

async function searchOpen(q: string): Promise<OpenListResponse> {
  const params = new URLSearchParams();
  params.set("q", q);
  // Sin "group": busca en TODOS los grupos (PEXA + CECOR) y todos los estatus.
  params.set("page", "1");
  params.set("limit", "50");
  const res = await fetch(`/api/incidents/open?${params.toString()}`);
  if (!res.ok) throw new Error("Error en la búsqueda");
  return res.json();
}

function statusColor(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("RESOLVED") || s.includes("RESUELT")) return "border-success/40 bg-success-dim text-success";
  if (s.includes("PROGRESS")) return "border-warning/40 bg-warning-dim text-warning";
  if (s.includes("PENDING")) return "border-accent/40 bg-accent/10 text-accent";
  return "border-border bg-surface text-text-muted";
}

function ResultCard({ r }: { r: OpenIncidentRow }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface/60 p-4 backdrop-blur-md transition-colors hover:border-accent/50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-text-primary">{r.incidentId}</span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold",
              r.group === "PEXA" ? "bg-accent/15 text-accent" : "bg-warning/15 text-warning"
            )}
          >
            {r.group}
          </span>
        </div>
        <span className={cn("rounded border px-2 py-0.5 text-xs font-semibold", statusColor(r.status))}>
          {r.status || "—"}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-text-muted">Apertura</dt>
          <dd className="font-mono text-text-primary">{formatHpsm(r.openTime)}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-text-muted">Empresa</dt>
          <dd className="truncate text-text-primary" title={r.company}>{r.company || "—"}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-text-muted">Servicio</dt>
          <dd className="truncate font-mono text-text-primary" title={r.serviceId}>{r.serviceId || "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Estado</dt>
          <dd className="text-text-primary">{r.state || "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Distrito</dt>
          <dd className="text-text-primary">{r.district || "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Asignado</dt>
          <dd className="font-mono text-text-primary">{r.assignee || "—"}</dd>
        </div>
        {r.siteCount > 1 && (
          <div>
            <dt className="text-text-muted"># Sitios</dt>
            <dd className="text-accent">{r.siteCount}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export function GlobalIncidentSearch() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  // Debounce: no pegamos al servidor en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const enabled = q.length >= MIN_CHARS;

  const { data, isFetching } = useQuery<OpenListResponse>({
    queryKey: ["open-global-search", q],
    queryFn: () => searchOpen(q),
    enabled,
    placeholderData: keepPreviousData,
  });

  const rows = enabled ? data?.data ?? [] : [];
  const total = data?.meta.total ?? 0;

  return (
    <div className="rounded-xl border border-border/60 bg-surface/40 p-4 backdrop-blur-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar incidente en todos los estatus (ID, empresa, servicio, estado, distrito, asignado)…"
          className="h-11 w-full rounded-lg border border-border bg-background/60 pl-10 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        {isFetching && enabled && (
          <Loader2 className="absolute right-10 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-muted" />
        )}
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            title="Limpiar"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Sin búsqueda: solo el campo, ninguna tabla. */}
      {!enabled && search.length > 0 && (
        <p className="mt-3 text-xs text-text-muted">Escribe al menos {MIN_CHARS} caracteres…</p>
      )}

      {enabled && (
        <div className="mt-4 space-y-3">
          {isFetching && rows.length === 0 ? (
            <p className="text-sm text-text-muted">Buscando…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-text-muted">
              Sin coincidencias para «<span className="text-text-primary">{q}</span>».
            </p>
          ) : (
            <>
              <p className="text-xs text-text-muted">
                {total} {total === 1 ? "incidente encontrado" : "incidentes encontrados"}
                {total > rows.length && ` (mostrando los primeros ${rows.length})`}
              </p>
              {rows.map((r) => (
                <ResultCard key={r.id} r={r} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
