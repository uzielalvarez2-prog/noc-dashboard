"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Siren, X, Download, ChevronDown, Check } from "lucide-react";
import { cn, formatHpsm, formatHpsmExcel } from "@/lib/utils";
import { downloadXLSX } from "@/lib/excelExport";

export interface EscalatedItem {
  incidentId: string;
  openTime: string | null;
  serviceId: string;
  state: string;
  district: string;
  assignee: string | null;
  status: string;
  company: string;
  group: string | null;
  stillOpen: boolean;
  markedBy: string;
  markedAt: string;
  note: string | null;
}

export interface EscalatedResponse {
  marked: string[];
  items: EscalatedItem[];
}

export async function fetchEscalated(): Promise<EscalatedResponse> {
  const res = await fetch("/api/incidents/escalated");
  if (!res.ok) throw new Error("Error al obtener escalados");
  return res.json();
}

function StatusBadge({ status, stillOpen }: { status: string; stillOpen: boolean }) {
  if (!stillOpen)
    return <span className="text-xs font-medium text-success">{status}</span>;
  const s = status.toUpperCase();
  const color = s.includes("RESOLVED")
    ? "text-success"
    : s.includes("PROGRESS")
    ? "text-warning"
    : s.includes("PENDING")
    ? "text-accent"
    : "text-text-muted";
  return <span className={cn("text-xs font-medium", color)}>{status || "—"}</span>;
}

function GroupBadge({ group }: { group: string | null }) {
  if (!group) return <span className="text-text-muted">—</span>;
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

const COLS = [
  "Incident ID", "Apertura", "Estatus", "Empresa", "Servicio",
  "Estado", "Asignado", "Distrito", "Grupo",
];

export function EscalatedPanel() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingNote, setEditingNote] = useState<Record<string, string>>({});

  const { data } = useQuery<EscalatedResponse>({
    queryKey: ["escalated"],
    queryFn: fetchEscalated,
    refetchInterval: 10_000,
  });

  const unmark = useMutation({
    mutationFn: async (incidentId: string) => {
      await fetch("/api/incidents/escalated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId, escalated: false }),
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["escalated"] }),
  });

  const saveNote = useMutation({
    mutationFn: async ({ incidentId, note }: { incidentId: string; note: string }) => {
      await fetch("/api/incidents/escalated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId, escalated: true, note }),
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["escalated"] }),
  });

  const items = data?.items ?? [];

  const toggleExpanded = (id: string) => {
    const newSet = new Set(expanded);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
      // Pre-fill edit field with current note
      if (!editingNote[id]) {
        setEditingNote((prev) => ({ ...prev, [id]: items.find((it) => it.incidentId === id)?.note ?? "" }));
      }
    }
    setExpanded(newSet);
  };

  const handleSaveNote = async (incidentId: string) => {
    const note = editingNote[incidentId] ?? "";
    await saveNote.mutateAsync({ incidentId, note });
  };

  function onExport() {
    const rows = items.map((it) => [
      it.incidentId,
      it.openTime ? formatHpsmExcel(it.openTime) : "—",
      it.status,
      it.company,
      it.serviceId,
      it.state,
      it.assignee ?? "—",
      it.district,
      it.group ?? "—",
    ]);
    downloadXLSX("escalados-atencion-especial.xlsx", "Escalados", COLS, rows);
  }

  return (
    <>
    <style>{`
      @keyframes edc-flash {
        0%, 49%  { color: #ef4444; }
        50%, 100% { color: #f59e0b; }
      }
      @keyframes edc-ping {
        0%        { transform: scale(1);   opacity: 1;   background-color: rgba(239,68,68,0.45); }
        49%       { transform: scale(1.9); opacity: 0;   background-color: rgba(239,68,68,0.1); }
        50%       { transform: scale(1);   opacity: 1;   background-color: rgba(245,158,11,0.45); }
        100%      { transform: scale(1.9); opacity: 0;   background-color: rgba(245,158,11,0.1); }
      }
      @keyframes edc-glow {
        0%, 49%  { box-shadow: 0 0 24px -4px rgba(239,68,68,0.55); border-color: rgba(239,68,68,0.5); }
        50%, 100% { box-shadow: 0 0 24px -4px rgba(245,158,11,0.55); border-color: rgba(245,158,11,0.5); }
      }
      @keyframes edc-header {
        0%, 49%  { background-color: rgba(239,68,68,0.10); border-color: rgba(239,68,68,0.35); }
        50%, 100% { background-color: rgba(245,158,11,0.10); border-color: rgba(245,158,11,0.35); }
      }
      @keyframes edc-badge {
        0%, 49%  { background-color: #ef4444; }
        50%, 100% { background-color: #f59e0b; }
      }
    `}</style>
    <div
      className="flex flex-col rounded-lg border bg-surface"
      style={{ animation: 'edc-glow 1s step-start infinite' }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"
        style={{ animation: 'edc-header 1s step-start infinite' }}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-5 w-5 items-center justify-center">
            <span
              className="absolute inline-flex h-full w-full rounded-full"
              style={{ animation: 'edc-ping 1s step-start infinite' }}
            />
            <Siren
              className="relative h-4 w-4"
              style={{ animation: 'edc-flash 1s step-start infinite' }}
            />
          </span>
          <h2
            className="text-sm font-bold uppercase tracking-wide"
            style={{ animation: 'edc-flash 1s step-start infinite' }}
          >
            Escalados - EDC
          </h2>
          {items.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 font-mono text-xs font-bold text-white"
              style={{ animation: 'edc-badge 1s step-start infinite' }}
            >
              {items.length}
            </span>
          )}
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-text-muted">
          Sin incidentes marcados. Usa la casilla ★ en la tabla de abiertos para
          escalar uno aquí.
        </p>
      ) : (
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-surface-elevated">
              <tr className="border-b border-border">
                <th className="px-2 py-2 w-6" />
                {COLS.map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-3 py-2 text-left font-medium uppercase tracking-wider text-text-muted"
                  >
                    {h}
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.flatMap((it) => [
                <tr
                  key={`row-${it.incidentId}`}
                  className={cn(
                    "border-b border-border/50 transition-colors",
                    it.stillOpen
                      ? "bg-warning/5 hover:bg-warning/10"
                      : "opacity-60 hover:opacity-80"
                  )}
                >
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(it.incidentId)}
                      className="rounded p-0.5 text-text-muted hover:bg-surface-elevated"
                    >
                      <ChevronDown
                        className={cn("h-4 w-4 transition-transform", expanded.has(it.incidentId) && "rotate-180")}
                      />
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-text-primary">{it.incidentId}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-text-muted">
                    {it.openTime ? formatHpsm(it.openTime) : "—"}
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={it.status} stillOpen={it.stillOpen} /></td>
                  <td className="max-w-[12rem] px-3 py-2">
                    <span className="block truncate text-text-primary" title={it.company}>{it.company}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-text-muted">{it.serviceId}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-text-primary">{it.state}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-text-primary">
                    {it.assignee ?? <span className="text-text-muted">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-text-primary">{it.district}</td>
                  <td className="px-3 py-2"><GroupBadge group={it.group} /></td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      title="Quitar de atención especial"
                      onClick={() => unmark.mutate(it.incidentId)}
                      className="rounded p-1 text-text-muted transition-colors hover:bg-surface-elevated hover:text-critical"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>,
                ...(expanded.has(it.incidentId)
                  ? [
                      <tr key={`note-${it.incidentId}`} className="border-b border-border/50 bg-surface-elevated/50">
                        <td colSpan={COLS.length + 2} className="px-4 py-3">
                          <div className="space-y-2">
                            <label className="block text-xs font-medium text-text-muted">Nota</label>
                            <textarea
                              value={editingNote[it.incidentId] ?? it.note ?? ""}
                              onChange={(e) =>
                                setEditingNote((prev) => ({ ...prev, [it.incidentId]: e.target.value }))
                              }
                              placeholder="Agregar nota especial..."
                              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
                              rows={3}
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveNote(it.incidentId)}
                              disabled={saveNote.isPending}
                              className="flex items-center gap-1.5 rounded-md border border-accent bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Guardar nota
                            </button>
                          </div>
                        </td>
                      </tr>,
                    ]
                  : []),
              ])}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </>
  );
}
