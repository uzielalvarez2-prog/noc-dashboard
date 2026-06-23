"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Siren, Flag, X, CheckCircle2, RotateCw, Search, Check, Pencil } from "lucide-react";

// UP/recuperado si el status contiene resolv/resuelt (mismo criterio que el server).
function isResolvedStatus(status: string | null | undefined): boolean {
  return /resolv|resuelt/i.test(status ?? "");
}

interface WarRoomItem {
  incidentId: string;
  openTime: string;
  status: string;
  company: string;
  serviceId: string;
  state: string;
  district: string;
  assignee: string | null;
  group: string;
  matchedBy: string;
  flagged: boolean;
  note: string;
  resolvedAt: string | null;
  firstSeenAt: string;
  recurrence: number;
}

async function fetchWarRoom(): Promise<{ items: WarRoomItem[] }> {
  const res = await fetch("/api/war-room");
  if (!res.ok) throw new Error("Error al cargar War Room");
  return res.json();
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DAY = 24 * 60 * 60 * 1000;

export function WarRoomView() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["war-room"],
    queryFn: fetchWarRoom,
    refetchInterval: 60_000,
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  // Qué tabla se muestra (los chips de arriba funcionan como pestañas).
  const [view, setView] = useState<"down" | "up24" | "cm">("down");

  // Dos cubetas: DOWN (caído) y UP (<24h).
  const { down, up24 } = useMemo(() => {
    const now = Date.now();
    const down: WarRoomItem[] = [];
    const up24: WarRoomItem[] = [];
    for (const it of items) {
      const resolved = Boolean(it.resolvedAt) || isResolvedStatus(it.status);
      if (!resolved) {
        down.push(it);
        continue;
      }
      const t = it.resolvedAt ? new Date(it.resolvedAt).getTime() : now;
      if (now - t < DAY) up24.push(it);
    }
    return { down, up24 };
  }, [items]);

  // Actualización parcial optimista en la caché + POST al server.
  async function patch(it: WarRoomItem, body: Partial<{ flagged: boolean; note: string; dismissed: boolean }>) {
    qc.setQueryData<{ items: WarRoomItem[] }>(["war-room"], (old) =>
      old
        ? {
            items: body.dismissed
              ? old.items.filter((x) => x.incidentId !== it.incidentId)
              : old.items.map((x) =>
                  x.incidentId === it.incidentId ? { ...x, ...body } : x
                ),
          }
        : old
    );
    try {
      await fetch("/api/war-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId: it.incidentId, ...body }),
      });
    } catch {
      qc.invalidateQueries({ queryKey: ["war-room"] });
    }
  }

  return (
    <div className="space-y-6">
      {/* Resumen / pestañas: cada chip muestra su tabla al hacer clic */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setView("down")}
          className={`flex items-center gap-2 rounded-lg border border-critical/40 bg-critical-dim px-3 py-2 transition-all ${
            view === "down" ? "ring-2 ring-critical" : "opacity-50 hover:opacity-100"
          }`}
        >
          <Siren className="h-4 w-4 text-critical" />
          <span className="text-sm text-text-primary">
            <span className="text-lg font-bold text-critical">{down.length}</span> DOWN
          </span>
        </button>
        <button
          onClick={() => setView("up24")}
          className={`flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 transition-all ${
            view === "up24" ? "ring-2 ring-success" : "opacity-50 hover:opacity-100"
          }`}
        >
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span className="text-sm text-text-primary">
            <span className="text-lg font-bold text-success">{up24.length}</span> UP
          </span>
        </button>
        <button
          onClick={() => setView("cm")}
          className={`flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 transition-all ${
            view === "cm" ? "ring-2 ring-accent" : "opacity-50 hover:opacity-100"
          }`}
        >
          <CheckCircle2 className="h-4 w-4 text-accent" />
          <span className="text-sm text-text-primary font-medium">Contrato Marco</span>
        </button>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["war-room"] })}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:text-text-primary"
        >
          <RotateCw className="h-3.5 w-3.5" /> Actualizar
        </button>
      </div>

      {view === "down" && (
        <WarRoomTable
          title="DOWN — caídos"
          accent="critical"
          items={down}
          isLoading={isLoading}
          emptyText="Sin incidentes de Clientes TOP caídos."
          onPatch={patch}
        />
      )}
      {view === "up24" && (
        <WarRoomTable
          title="UP — recuperados (24 h)"
          accent="success"
          items={up24}
          isLoading={isLoading}
          emptyText="Sin recuperaciones en las últimas 24 h."
          onPatch={patch}
        />
      )}
      {view === "cm" && <ContratoMarcoView />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type Accent = "critical" | "success" | "muted";

function WarRoomTable({
  title,
  accent,
  items,
  isLoading,
  emptyText,
  onPatch,
}: {
  title: string;
  accent: Accent;
  items: WarRoomItem[];
  isLoading: boolean;
  emptyText: string;
  onPatch: (
    it: WarRoomItem,
    body: Partial<{ flagged: boolean; note: string; dismissed: boolean }>
  ) => void;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) =>
      [
        it.incidentId,
        it.status,
        it.company,
        it.serviceId,
        it.state,
        it.district,
        it.assignee ?? "",
        it.note,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [items, q]);

  const titleColor =
    accent === "critical"
      ? "text-critical"
      : accent === "success"
      ? "text-success"
      : "text-text-primary";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className={`text-base font-semibold ${titleColor}`}>{title}</h2>
          <span className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
            {items.length}
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar..."
            className="rounded-md border border-border bg-surface py-1.5 pl-7 pr-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 border-b border-border bg-surface-elevated px-3 py-2.5 text-left text-xs font-medium text-text-muted">Nota</th>
              <th className="sticky top-0 z-10 border-b border-border bg-surface-elevated px-3 py-2.5 text-center text-xs font-medium text-text-muted">Quitar</th>
              <th className="sticky top-0 z-10 border-b border-border bg-surface-elevated px-3 py-2.5 text-center text-xs font-medium text-text-muted">🚩</th>
              <th className="sticky top-0 z-10 border-b border-border bg-surface-elevated px-3 py-2.5 text-left text-xs font-medium text-text-muted">Incidente</th>
              <th className="sticky top-0 z-10 border-b border-border bg-surface-elevated px-3 py-2.5 text-left text-xs font-medium text-text-muted">Apertura</th>
              <th className="sticky top-0 z-10 border-b border-border bg-surface-elevated px-3 py-2.5 text-left text-xs font-medium text-text-muted">Estatus</th>
              <th className="sticky top-0 z-10 border-b border-border bg-surface-elevated px-3 py-2.5 text-left text-xs font-medium text-text-muted">Empresa</th>
              <th className="sticky top-0 z-10 border-b border-border bg-surface-elevated px-3 py-2.5 text-left text-xs font-medium text-text-muted">Servicio</th>
              <th className="sticky top-0 z-10 border-b border-border bg-surface-elevated px-3 py-2.5 text-left text-xs font-medium text-text-muted">Estado</th>
              <th className="sticky top-0 z-10 border-b border-border bg-surface-elevated px-3 py-2.5 text-left text-xs font-medium text-text-muted">Asignado</th>
              <th className="sticky top-0 z-10 border-b border-border bg-surface-elevated px-3 py-2.5 text-left text-xs font-medium text-text-muted">Distrito</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-sm text-text-muted">
                  Cargando...
                </td>
              </tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-sm text-text-muted">
                  {emptyText}
                </td>
              </tr>
            )}
            {!isLoading && items.length > 0 && filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-sm text-text-muted">
                  Sin coincidencias
                </td>
              </tr>
            )}
            {filtered.map((it) => {
              const resolved = Boolean(it.resolvedAt) || isResolvedStatus(it.status);
              const rowText = it.flagged ? "text-critical" : "text-text-primary";
              return (
                <tr
                  key={it.incidentId}
                  className="border-b border-border transition-colors last:border-0 hover:bg-surface-elevated/40"
                >
                  <td className="px-3 py-2.5">
                    <NoteCell value={it.note} onSave={(note) => onPatch(it, { note })} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => onPatch(it, { dismissed: true })}
                      title="Quitar de War Room"
                      className="text-text-muted/50 transition-colors hover:text-critical"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => onPatch(it, { flagged: !it.flagged })}
                      title={it.flagged ? "Quitar bandera" : "Marcar bandera"}
                      className={it.flagged ? "text-critical" : "text-text-muted/50 hover:text-text-muted"}
                    >
                      <Flag className={`h-4 w-4 ${it.flagged ? "fill-critical" : ""}`} />
                    </button>
                  </td>
                  <td className={`px-3 py-2.5 font-mono text-xs font-semibold ${rowText}`}>
                    {it.incidentId}
                    {it.recurrence > 1 && (
                      <span
                        title={`${it.recurrence} caídas de este cliente/servicio en 7 días`}
                        className="ml-1.5 rounded bg-warning/15 px-1 text-[10px] font-bold text-warning"
                      >
                        ⟳{it.recurrence}
                      </span>
                    )}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2.5 text-xs ${rowText}`}>{fmt(it.openTime)}</td>
                  {/* Estatus: verde=recuperado, rojo=bandera, ámbar=caído */}
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${
                        resolved
                          ? "border-success/40 bg-success/10 text-success"
                          : it.flagged
                          ? "border-critical/40 bg-critical-dim text-critical"
                          : "border-warning/40 bg-warning-dim text-warning"
                      }`}
                    >
                      {it.status || "—"}
                    </span>
                  </td>
                  <td className={`px-3 py-2.5 ${rowText}`}>{it.company || "—"}</td>
                  <td className={`px-3 py-2.5 font-mono text-xs ${rowText}`}>
                    <div className="max-w-[11rem] truncate" title={it.serviceId}>
                      {it.serviceId || "—"}
                    </div>
                  </td>
                  <td className={`px-3 py-2.5 text-xs ${rowText}`}>{it.state || "—"}</td>
                  <td className={`px-3 py-2.5 text-xs ${rowText}`}>{it.assignee || "—"}</td>
                  <td className={`px-3 py-2.5 text-xs ${rowText}`}>{it.district || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

async function fetchContratoMarco(): Promise<{ items: WarRoomItem[] }> {
  const res = await fetch("/api/contrato-marco");
  if (!res.ok) throw new Error("Error al cargar Contrato Marco");
  return res.json();
}

const HALF_DAY = 12 * 60 * 60 * 1000;

function ContratoMarcoView() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["contrato-marco"],
    queryFn: fetchContratoMarco,
    refetchInterval: 60_000,
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const [subView, setSubView] = useState<"down" | "up12">("down");

  const { down, up12 } = useMemo(() => {
    const now = Date.now();
    const down: WarRoomItem[] = [];
    const up12: WarRoomItem[] = [];
    for (const it of items) {
      const resolved = Boolean(it.resolvedAt) || isResolvedStatus(it.status);
      if (!resolved) { down.push(it); continue; }
      const t = it.resolvedAt ? new Date(it.resolvedAt).getTime() : now;
      if (now - t < HALF_DAY) up12.push(it);
    }
    return { down, up12 };
  }, [items]);

  async function patch(it: WarRoomItem, body: Partial<{ flagged: boolean; note: string; dismissed: boolean }>) {
    qc.setQueryData<{ items: WarRoomItem[] }>(["contrato-marco"], (old) =>
      old
        ? {
            items: body.dismissed
              ? old.items.filter((x) => x.incidentId !== it.incidentId)
              : old.items.map((x) => x.incidentId === it.incidentId ? { ...x, ...body } : x),
          }
        : old
    );
    try {
      await fetch("/api/contrato-marco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId: it.incidentId, ...body }),
      });
    } catch {
      qc.invalidateQueries({ queryKey: ["contrato-marco"] });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setSubView("down")}
          className={`flex items-center gap-2 rounded-lg border border-critical/40 bg-critical-dim px-3 py-2 transition-all ${
            subView === "down" ? "ring-2 ring-critical" : "opacity-50 hover:opacity-100"
          }`}
        >
          <Siren className="h-4 w-4 text-critical" />
          <span className="text-sm text-text-primary">
            <span className="text-lg font-bold text-critical">{down.length}</span> DOWN
          </span>
        </button>
        <button
          onClick={() => setSubView("up12")}
          className={`flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 transition-all ${
            subView === "up12" ? "ring-2 ring-success" : "opacity-50 hover:opacity-100"
          }`}
        >
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span className="text-sm text-text-primary">
            <span className="text-lg font-bold text-success">{up12.length}</span> UP (12h)
          </span>
        </button>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["contrato-marco"] })}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:text-text-primary"
        >
          <RotateCw className="h-3.5 w-3.5" /> Actualizar
        </button>
      </div>

      {subView === "down" && (
        <WarRoomTable
          title="Contrato Marco — DOWN"
          accent="critical"
          items={down}
          isLoading={isLoading}
          emptyText="Sin incidentes de Contrato Marco caídos."
          onPatch={patch}
        />
      )}
      {subView === "up12" && (
        <WarRoomTable
          title="Contrato Marco — UP (12 h)"
          accent="success"
          items={up12}
          isLoading={isLoading}
          emptyText="Sin recuperaciones en las últimas 12 h."
          onPatch={patch}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

// Celda de nota editable in-place: click al lápiz → input → ✔ guarda / X cancela.
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
            if (e.key === "Enter") {
              onSave(draft);
              setEditing(false);
            }
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          placeholder="Nota..."
          className="w-40 rounded border border-border bg-surface px-1.5 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
        />
        <button
          onClick={() => {
            onSave(draft);
            setEditing(false);
          }}
          title="Guardar"
          className="text-success hover:opacity-80"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => {
            setDraft(value);
            setEditing(false);
          }}
          title="Cancelar"
          className="text-text-muted hover:text-text-primary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title="Editar nota"
      className="group flex max-w-[12rem] items-center gap-1 text-left text-xs text-text-muted hover:text-text-primary"
    >
      <span className="truncate">{value || "—"}</span>
      <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  );
}
