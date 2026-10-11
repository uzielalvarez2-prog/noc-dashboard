"use client";

import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Search, X, Star, Trash2, AlertTriangle, Loader2, Pencil, Check } from "lucide-react";
import { useTheme } from "@/components/layout/ThemeProvider";
import { cn } from "@/lib/utils";
import { OpenIncidentTable } from "./OpenIncidentTable";
import type { SortDir } from "@/lib/exportOpenIncidents";
import type { OpenListResponse } from "@/types/open";

interface ClienteTopStat {
  id: string;
  company: string;
  /** Nombre corto a mostrar en la tarjeta (alias); igual a company si no se definió uno. */
  displayName: string;
  siglasIm: string;
  serviceRef: string;
  note: string | null;
  openCount: number;
  /** IM's aún no resueltos (los RESOLVED siguen en el snapshot hasta el cierre). */
  activeCount: number;
  criticalCount: number;
  /** Edad en ms de cada incidente que ya superó el SLA de 4h, sin resolver. */
  delayedMs: number[];
}

/** "1d 4h" / "4h" — se trunca a horas (no se baja a minutos: el SLA es de 4h). */
function formatDilacion(ms: number): string {
  const totalHours = Math.floor(ms / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  return `${hours}h`;
}

/** Agrupa las dilaciones iguales: "1 con dilación de 1d 4h", "1 con dilación de 4h". */
function describirDilaciones(delayedMs: number[]): string[] {
  const counts = new Map<string, { count: number; ms: number }>();
  for (const ms of delayedMs) {
    const label = formatDilacion(ms);
    const prev = counts.get(label);
    counts.set(label, { count: (prev?.count ?? 0) + 1, ms });
  }
  // Dilación más grave (mayor) primero.
  return [...counts.entries()]
    .sort((a, b) => b[1].ms - a[1].ms)
    .map(([label, { count }]) => `${count} con dilación de ${label}`);
}

// Dilación máxima del cliente (0 si no tiene ninguno vencido) — para ordenar y
// colorear la franja de la lista por gravedad.
function maxDilacion(c: ClienteTopStat): number {
  return c.delayedMs.length > 0 ? Math.max(...c.delayedMs) : 0;
}

// Semáforo de la fila:
//   rojo   = al menos 1 IM activo con dilación >4h
//   ámbar  = tiene IM's activos (sin resolver) pero ninguno pasó las 4h
//   verde  = tiene IM's pero TODOS están en RESOLVED (nada en gestión)
//   gris   = no tiene ningún IM en el snapshot
function sevColor(c: ClienteTopStat): string {
  if (c.delayedMs.length > 0) return "bg-critical";
  if (c.activeCount > 0) return "bg-warning";
  if (c.openCount > 0) return "bg-success";
  return "bg-text-muted/40";
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
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["clientes-top-stats"],
    queryFn: fetchClienteTopStats,
    refetchInterval: 240_000, // mismo ritmo que el resto de Incidentes abiertos
  });
  const clientes = data?.clientes ?? [];

  // Filtrado en memoria: la lista de clientes TOP es chica (el usuario la arma a
  // mano), no vale la pena un endpoint de búsqueda aparte. Busca por alias y por
  // nombre completo, sin acentos ni mayúsculas.
  const q = norm(search.trim());
  const visibleClientes = (q
    ? clientes.filter((c) => norm(c.displayName).includes(q) || norm(c.company).includes(q))
    : clientes
  )
    .slice()
    // Más grave primero: mayor dilación, luego más IM's abiertos, luego alfabético.
    .sort(
      (a, b) =>
        maxDilacion(b) - maxDilacion(a) ||
        b.openCount - a.openCount ||
        a.displayName.localeCompare(b.displayName, "es"),
    );

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/clientes-top/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clientes-top-stats"] });
      setSelected(null);
    },
  });

  // PUT reemplaza el registro completo, así que siempre se manda company/siglasIm/
  // serviceRef actuales junto con el note (alias) nuevo — si solo mandáramos note,
  // el endpoint pisaría company con "" y el cliente dejaría de matchear.
  const renameMutation = useMutation({
    mutationFn: async ({ cliente, alias }: { cliente: ClienteTopStat; alias: string }) => {
      const res = await fetch(`/api/clientes-top/${cliente.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: cliente.company,
          siglasIm: cliente.siglasIm,
          serviceRef: cliente.serviceRef,
          note: alias,
        }),
      });
      if (!res.ok) throw new Error("No se pudo actualizar");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clientes-top-stats"] }),
  });

  const cardCls = (critical: boolean, active: boolean) =>
    cn(
      "group relative w-full rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5",
      critical
        ? isLight
          ? "border-critical/50 bg-critical-dim/40 hover:shadow-md"
          : "border-critical/50 bg-critical-dim shadow-[0_0_16px_-4px_rgba(239,68,68,0.35)] hover:shadow-[0_0_20px_-2px_rgba(239,68,68,0.5)]"
        : isLight
          ? "border-amber-300 bg-amber-50 hover:shadow-md"
          : "border-amber-500/40 bg-amber-500/10 hover:shadow-[0_0_16px_-4px_rgba(245,158,11,0.4)]",
      // Tarjeta en consulta: anillo de acento bien visible, por encima del estilo
      // crítico/normal, para que quede claro cuál detalle está abierto ahora.
      active && (isLight ? "ring-2 ring-accent -translate-y-0.5" : "ring-2 ring-accent shadow-[0_0_14px_1px_rgba(59,130,246,0.5)] -translate-y-0.5"),
    );

  function renderCard(c: ClienteTopStat, isSelected: boolean) {
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => setSelected(isSelected ? null : c)}
        className={cardCls(c.criticalCount > 0, isSelected)}
      >
        {isSelected && (
          <span className="absolute left-3 top-2.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            En consulta
          </span>
        )}
        {isSelected ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setSelected(null);
            }}
            title="Cerrar vista de incidentes"
            className="absolute right-2 top-2 rounded p-1 text-text-muted hover:bg-black/10 hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : (
          c.criticalCount > 0 && (
            <AlertTriangle className="absolute right-3 top-3 h-4 w-4 text-critical" />
          )
        )}
        <p
          className={cn(
            "truncate pr-5 text-sm font-semibold text-text-primary",
            isSelected && "mt-3.5",
          )}
          title={c.displayName !== c.company ? `${c.displayName} — ${c.company}` : c.company}
        >
          {c.displayName}
        </p>
        <p className="mt-3 flex items-baseline gap-1.5">
          <span className="text-3xl font-bold text-text-primary">{c.openCount}</span>
          <span className="text-xs text-text-muted">IM&apos;s en gestión</span>
        </p>
        {c.delayedMs.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {describirDilaciones(c.delayedMs).map((linea) => (
              <p key={linea} className="text-sm font-medium text-amber-500/80">
                {linea}
              </p>
            ))}
          </div>
        )}
      </button>
    );
  }

  // Con un cliente seleccionado, se oculta el grid completo: solo queda esa
  // tarjeta arriba y su detalle debajo (lo que pidió el usuario — nada de la
  // lista general distrae mientras consulta un cliente puntual).
  if (selected) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="text-xs font-medium text-accent hover:underline"
        >
          ← Ver todos los clientes
        </button>
        <div className="mx-auto w-full max-w-xs">{renderCard(selected, true)}</div>
        <ClienteDetail
          cliente={selected}
          onClose={() => setSelected(null)}
          onRemove={() => removeMutation.mutate(selected.id)}
          removing={removeMutation.isPending}
          onRename={(alias) => renameMutation.mutate({ cliente: selected, alias })}
          renaming={renameMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          {clientes.length === 0
            ? "Aún no has marcado ningún cliente como TOP."
            : `${clientes.length} cliente${clientes.length === 1 ? "" : "s"} TOP · ${clientes.reduce((a, c) => a + c.openCount, 0)} incidentes abiertos`}
        </p>
        <div className="flex items-center gap-2">
          {clientes.length > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente…"
                className="h-9 w-48 rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none sm:w-64"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar cliente
          </button>
        </div>
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
      ) : visibleClientes.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">
          Sin coincidencias para "{search}".
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="max-h-[60vh] overflow-y-auto">
            {visibleClientes.map((c) => {
              const dils = describirDilaciones(c.delayedMs);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c)}
                  className="flex w-full items-center gap-3 border-b border-border/50 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface-elevated"
                >
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", sevColor(c))} />
                  <span
                    className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary sm:w-72 sm:flex-none"
                    title={c.displayName !== c.company ? `${c.displayName} — ${c.company}` : c.company}
                  >
                    {c.displayName}
                  </span>
                  <span className="hidden w-20 shrink-0 text-right tabular-nums sm:block">
                    <span className="text-base font-bold text-text-primary">{c.openCount}</span>
                    <span className="ml-1 text-xs text-text-muted">IM&apos;s</span>
                  </span>
                  {/* En móvil el número va aquí (sin columna fija); en ≥sm lo toma el bloque de arriba. */}
                  <span className="shrink-0 tabular-nums sm:hidden">
                    <span className="text-base font-bold text-text-primary">{c.openCount}</span>
                    <span className="ml-1 text-xs text-text-muted">IM&apos;s</span>
                  </span>
                  <span className="hidden min-w-0 flex-1 truncate pl-8 text-xs font-medium text-amber-500/80 sm:block">
                    {dils.length > 0 ? dils.join(" · ") : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
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
  onRename,
  renaming,
}: {
  cliente: ClienteTopStat;
  onClose: () => void;
  onRemove: () => void;
  removing: boolean;
  onRename: (alias: string) => void;
  renaming: boolean;
}) {
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  void sortDir; // sin control de orden en este panel por ahora; la tabla lo acepta igual

  const [editing, setEditing] = useState(false);
  const [alias, setAlias] = useState(cliente.note ?? "");

  function saveAlias() {
    onRename(alias.trim());
    setEditing(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveAlias();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder={cliente.company}
              maxLength={60}
              className="h-7 rounded-md border border-border bg-background/60 px-2 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={saveAlias}
              disabled={renaming}
              title="Guardar"
              className="rounded p-1 text-success hover:bg-success-dim disabled:opacity-50"
            >
              {renaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              title="Cancelar"
              className="rounded p-1 text-text-muted hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <h2 className="text-sm font-semibold text-text-primary">
            Incidentes abiertos — <span className="text-accent">{cliente.displayName}</span>
          </h2>
        )}
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setAlias(cliente.note ?? "");
              setEditing(true);
            }}
            title="Editar nombre abreviado"
            className="rounded p-1 text-text-muted hover:text-text-primary"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
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
