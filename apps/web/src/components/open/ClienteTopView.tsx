"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Search, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddClienteModal } from "./cliente-top/AddClienteModal";
import { ClienteTopDetail } from "./cliente-top/ClienteTopDetail";
import { ClienteTopList } from "./cliente-top/ClienteTopList";
import { ClienteTopSummary, type SeverityFilter } from "./cliente-top/ClienteTopSummary";
import {
  SEVERITY_ORDER,
  matchesQuery,
  norm,
  severityOf,
  sortClientes,
  type ClienteTopStat,
  type Severity,
  type SortKey,
} from "./cliente-top/clienteTopUtils";

// Resplandor ambiental muy sutil detrás de las tarjetas (look "glass"),
// puramente decorativo — nunca intercepta clicks.
function Glow({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -left-16 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-16 h-80 w-80 rounded-full bg-critical/[0.08] blur-3xl" />
      <div className="relative">{children}</div>
    </div>
  );
}

async function fetchClienteTopStats(): Promise<{ clientes: ClienteTopStat[] }> {
  const res = await fetch("/api/clientes-top/stats");
  if (!res.ok) throw new Error("Error al cargar Cliente TOP");
  return res.json();
}

// Tablero Cliente TOP en dos paneles: lista compacta a la izquierda y ficha del
// cliente activo a la derecha. Todo sale del snapshot de OpenIncident (el CSV de
// HPSM): resumen por semáforo arriba, gráfica de antigüedad por IM en la ficha.
export function ClienteTopView() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("gravedad");
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const searchRef = useRef<HTMLInputElement>(null);
  const listPanelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["clientes-top-stats"],
    queryFn: fetchClienteTopStats,
    refetchInterval: 240_000, // mismo ritmo que el resto de Incidentes abiertos
  });
  const clientes = useMemo(() => data?.clientes ?? [], [data]);
  // Las edades de la ficha se miden al momento del último refetch, igual que la
  // dilación que calcula el endpoint, para que lista y ficha no se contradigan.
  const now = dataUpdatedAt;

  const counts = useMemo(() => {
    const acc = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0])) as Record<Severity, number>;
    for (const c of clientes) acc[severityOf(c)] += 1;
    return acc;
  }, [clientes]);

  // Filtrado en memoria: la lista de clientes TOP es chica (el usuario la arma a
  // mano). Busca por alias/nombre y también por IM, servicio, sitio o estado.
  const q = norm(search.trim());
  const visible = useMemo(
    () =>
      sortClientes(
        clientes.filter((c) => (filter === "all" || severityOf(c) === filter) && matchesQuery(c, q)),
        sort,
      ),
    [clientes, filter, q, sort],
  );

  // Cliente elegido a mano (si sigue visible) o, por defecto, el primero de la
  // lista — así la ficha nunca queda vacía y teclear en el buscador la actualiza.
  const selected = visible.find((c) => c.id === selectedId) ?? null;
  const active = selected ?? visible[0] ?? null;
  const maxOpen = Math.max(1, ...clientes.map((c) => c.openCount));

  // "/" enfoca el buscador desde cualquier parte del tablero (salvo escribiendo).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (addOpen || e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) {
        return;
      }
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen]);

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/clientes-top/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clientes-top-stats"] });
      setSelectedId(null);
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

  function focusFirstRow() {
    listPanelRef.current?.querySelector<HTMLElement>("[data-id]")?.focus();
  }

  return (
    <Glow>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <p className="shrink-0 text-sm text-text-muted">
            {clientes.length === 0
              ? "Aún no has marcado ningún cliente como TOP."
              : `${clientes.length} cliente${clientes.length === 1 ? "" : "s"} TOP · ${clientes.reduce((a, c) => a + c.openCount, 0)} incidentes abiertos`}
          </p>

          {clientes.length > 0 && (
            <div className="order-last w-full sm:order-none sm:flex-1 sm:px-4">
              <div className="group relative mx-auto w-full max-w-md">
                <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-text-muted transition-colors group-focus-within:text-accent" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setSearch("");
                      e.currentTarget.blur();
                    } else if ((e.key === "Enter" || e.key === "ArrowDown") && visible.length > 0) {
                      // Pasa al listado con el primer resultado, listo para ↑/↓.
                      e.preventDefault();
                      setSelectedId(visible[0].id);
                      focusFirstRow();
                    }
                  }}
                  placeholder="Buscar cliente, IM, servicio o sitio…"
                  className="h-10 w-full rounded-full border border-border/70 bg-surface/60 pl-11 pr-10 text-sm text-text-primary placeholder:text-text-muted backdrop-blur-md transition-all focus:border-accent/60 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/15"
                />
                {!search && (
                  <kbd className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded border border-border/70 px-1.5 text-[10px] text-text-muted">
                    /
                  </kbd>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar cliente
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-text-muted">Cargando…</p>
        ) : clientes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center">
            <Star className="mx-auto h-6 w-6 text-text-muted" />
            <p className="mt-3 text-sm text-text-muted">
              Marca un cliente como TOP desde "Agregar cliente" y aquí verás sus incidentes
              abiertos de un vistazo.
            </p>
          </div>
        ) : (
          <>
            <ClienteTopSummary counts={counts} total={clientes.length} filter={filter} onFilter={setFilter} />

            {visible.length === 0 ? (
              <div className="py-6 text-center text-sm text-text-muted">
                {q ? <>Sin coincidencias para "{search}".</> : "Ningún cliente en este estado."}{" "}
                {(q || filter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                    }}
                    className="font-medium text-accent hover:underline"
                  >
                    Quitar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
                {/* En pantallas chicas se ve lista O ficha (como antes); en ≥lg, las dos. */}
                <div ref={listPanelRef} className={cn("lg:sticky lg:top-4", selected && "hidden lg:block")}>
                  <ClienteTopList
                    clientes={visible}
                    activeId={active?.id ?? null}
                    query={q}
                    maxOpen={maxOpen}
                    sort={sort}
                    onSort={setSort}
                    onSelect={setSelectedId}
                  />
                </div>
                <div className={cn("min-w-0", !selected && "hidden lg:block")}>
                  {active && (
                    <ClienteTopDetail
                      key={active.id}
                      cliente={active}
                      now={now}
                      onBack={() => setSelectedId(null)}
                      onRemove={() => removeMutation.mutate(active.id)}
                      removing={removeMutation.isPending}
                      onRename={(alias) => renameMutation.mutate({ cliente: active, alias })}
                      renaming={renameMutation.isPending}
                    />
                  )}
                </div>
              </div>
            )}
          </>
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
    </Glow>
  );
}
