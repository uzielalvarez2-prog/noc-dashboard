"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Siren,
  Flag,
  X,
  RotateCw,
  Search,
  Check,
  Pencil,
} from "lucide-react";

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

function isResolvedStatus(status: string | null | undefined): boolean {
  return /resolv|resuelt/i.test(status ?? "");
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
    timeZone: "UTC",
  });
}

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
            if (e.key === "Enter") { onSave(draft); setEditing(false); }
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
          placeholder="Nota..."
          className="w-40 rounded border border-border bg-surface px-1.5 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
        />
        <button onClick={() => { onSave(draft); setEditing(false); }} title="Guardar" className="text-success hover:opacity-80">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => { setDraft(value); setEditing(false); }} title="Cancelar" className="text-text-muted hover:text-text-primary">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Editar nota"
      className="group flex max-w-[12rem] items-center gap-1 text-left text-xs text-text-muted hover:text-text-primary"
    >
      <span className="truncate">{value || "—"}</span>
      <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  );
}

export function CriticosDownView() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["war-room"],
    queryFn: fetchWarRoom,
    refetchInterval: 60_000,
  });

  const [q, setQ] = useState("");

  const items = useMemo(() => data?.items ?? [], [data]);

  const down = useMemo(() =>
    items.filter((it) => !Boolean(it.resolvedAt) && !isResolvedStatus(it.status)),
    [items]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return down;
    return down.filter((it) =>
      [it.incidentId, it.status, it.company, it.serviceId, it.state, it.district, it.assignee ?? "", it.note]
        .join(" ").toLowerCase().includes(needle)
    );
  }, [down, q]);

  async function patch(it: WarRoomItem, body: Partial<{ flagged: boolean; note: string; dismissed: boolean }>) {
    qc.setQueryData<{ items: WarRoomItem[] }>(["war-room"], (old) =>
      old
        ? {
            items: body.dismissed
              ? old.items.filter((x) => x.incidentId !== it.incidentId)
              : old.items.map((x) => x.incidentId === it.incidentId ? { ...x, ...body } : x),
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-critical/40 bg-critical-dim px-3 py-2">
            <Siren className="h-4 w-4 text-critical" />
            <span className="text-sm text-text-primary">
              <span className="text-lg font-bold text-critical">{down.length}</span> DOWN
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar..."
              className="rounded-md border border-border bg-surface py-1.5 pl-7 pr-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
            />
          </div>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["war-room"] })}
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:text-text-primary"
          >
            <RotateCw className="h-3.5 w-3.5" /> Actualizar
          </button>
        </div>
      </div>

      <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {["Nota", "Quitar", "🚩", "Incidente", "Apertura", "Estatus", "Empresa", "Servicio", "Estado", "Asignado", "Distrito"].map((h) => (
                <th key={h} className="sticky top-0 z-10 border-b border-border bg-surface-elevated px-3 py-2.5 text-left text-xs font-medium text-text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-sm text-text-muted">Cargando...</td></tr>
            )}
            {!isLoading && down.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-sm text-text-muted">Sin incidentes de Clientes TOP caídos.</td></tr>
            )}
            {!isLoading && down.length > 0 && filtered.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-sm text-text-muted">Sin coincidencias</td></tr>
            )}
            {filtered.map((it) => {
              const rowText = it.flagged ? "text-critical" : "text-text-primary";
              return (
                <tr key={it.incidentId} className="border-b border-border transition-colors last:border-0 hover:bg-surface-elevated/40">
                  <td className="px-3 py-2.5">
                    <NoteCell value={it.note} onSave={(note) => patch(it, { note })} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button onClick={() => patch(it, { dismissed: true })} title="Quitar" className="text-text-muted/50 transition-colors hover:text-critical">
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button onClick={() => patch(it, { flagged: !it.flagged })} title={it.flagged ? "Quitar bandera" : "Marcar"} className={it.flagged ? "text-critical" : "text-text-muted/50 hover:text-text-muted"}>
                      <Flag className={`h-4 w-4 ${it.flagged ? "fill-critical" : ""}`} />
                    </button>
                  </td>
                  <td className={`px-3 py-2.5 font-mono text-xs font-semibold ${rowText}`}>
                    {it.incidentId}
                    {it.recurrence > 1 && (
                      <span title={`${it.recurrence} caídas en 7 días`} className="ml-1.5 rounded bg-warning/15 px-1 text-[10px] font-bold text-warning">
                        ⟳{it.recurrence}
                      </span>
                    )}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2.5 text-xs ${rowText}`}>{fmt(it.openTime)}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center rounded border border-warning/40 bg-warning-dim px-2 py-0.5 text-xs font-semibold text-warning">
                      {it.status || "—"}
                    </span>
                  </td>
                  <td className={`px-3 py-2.5 ${rowText}`}>{it.company || "—"}</td>
                  <td className={`px-3 py-2.5 font-mono text-xs ${rowText}`}>
                    <div className="max-w-[11rem] truncate" title={it.serviceId}>{it.serviceId || "—"}</div>
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
