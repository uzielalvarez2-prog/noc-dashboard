"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flame, Search, X, RefreshCw, FileText, Copy, Check, Save } from "lucide-react";
import { cn, formatHpsm } from "@/lib/utils";
import { HpsmIncidentId } from "@/components/shared/HpsmIncidentId";

export interface CriticalItem {
  incidentId: string;
  openTime: string | null;
  serviceId: string;
  state: string;
  district: string;
  siteName: string | null;
  assignee: string | null;
  status: string;
  company: string;
  group: string | null;
  stillOpen: boolean;
  markedAt: string;
  // Formato EDC (texto): editado > reporte WhatsApp > generado desde SISA/abiertos.
  edcText: string;
  edcSource: "editado" | "whatsapp" | "generado" | "sin-datos";
  edcEdited: boolean;
}

export interface CriticalResponse {
  marked: string[];
  items: CriticalItem[];
}

export async function fetchCritical(): Promise<CriticalResponse> {
  const res = await fetch("/api/incidents/critical");
  if (!res.ok) throw new Error("Error al obtener críticos");
  return res.json();
}

function StatusCell({ status, stillOpen }: { status: string; stillOpen: boolean }) {
  if (!stillOpen)
    return <span className="text-xs font-medium text-text-muted">{status}</span>;
  const s = (status || "").toUpperCase();
  const color = s.includes("RESOLV") || s.includes("RESUELT")
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
  "Estado", "Distrito", "Sitio", "Asignado", "Grupo", "EDC",
];

// Editor del "Formato EDC" de un crítico: textarea con Copiar, Guardar (persiste
// la edición privada) y Restaurar (borra la edición → vuelve al texto original).
function EdcEditor({
  item,
  onClose,
  onSave,
  onRestore,
  saving,
}: {
  item: CriticalItem;
  onClose: () => void;
  onSave: (text: string) => void;
  onRestore: () => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(item.edcText);
  const [copied, setCopied] = useState(false);
  // Si el texto del servidor cambia (p.ej. tras guardar o refetch) y no hay
  // ediciones locales sin guardar, sincroniza el borrador.
  useEffect(() => {
    setDraft(item.edcText);
  }, [item.edcText]);

  const dirty = draft !== item.edcText;
  const sourceLabel =
    item.edcSource === "editado"
      ? "editado por ti"
      : item.edcSource === "whatsapp"
      ? "desde Reporte WhatsApp"
      : item.edcSource === "generado"
      ? "generado (SISA/abiertos)"
      : "sin datos";

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = draft;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-2 rounded-lg border border-violet-500/40 bg-surface/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
          <FileText className="h-3.5 w-3.5 text-violet-400" />
          Formato EDC · {item.incidentId}
          <span className="font-normal text-text-muted">({sourceLabel})</span>
        </span>
        <button type="button" onClick={onClose} title="Cerrar" className="text-text-muted hover:text-text-primary">
          <X className="h-4 w-4" />
        </button>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={Math.min(14, Math.max(7, draft.split("\n").length + 1))}
        spellCheck={false}
        className="w-full resize-y rounded-md border border-border bg-background/60 p-2.5 font-mono text-xs leading-relaxed text-text-primary focus:border-accent focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className={cn(
            "flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
            copied ? "border-success/50 bg-success/10 text-success" : "border-border text-text-muted hover:text-text-primary"
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={saving || !dirty}
          title={dirty ? "Guardar tu versión" : "Sin cambios por guardar"}
          className="flex items-center gap-1 rounded-md border border-violet-500/50 bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/20 disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Guardando…" : "Guardar"}
        </button>
        {item.edcEdited && (
          <button
            type="button"
            onClick={onRestore}
            disabled={saving}
            title="Borrar tu edición y volver al texto original"
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-text-primary disabled:opacity-40"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Restaurar
          </button>
        )}
        {dirty && <span className="text-[11px] text-warning">· cambios sin guardar</span>}
      </div>
    </div>
  );
}

export function CriticalIncidentsView() {
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  // Incidente cuyo editor EDC está abierto (null = ninguno).
  const [editingEdc, setEditingEdc] = useState<string | null>(null);
  // Feedback visual del botón "Copiar todos los EDC".
  const [copiedAll, setCopiedAll] = useState(false);

  const { data, isFetching, refetch } = useQuery<CriticalResponse>({
    queryKey: ["critical"],
    queryFn: fetchCritical,
    refetchInterval: 30_000,
  });

  const unmark = useMutation({
    mutationFn: async (incidentId: string) => {
      await fetch("/api/incidents/critical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId, critical: false }),
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["critical"] }),
  });

  const saveEdc = useMutation({
    mutationFn: async ({ incidentId, edcText }: { incidentId: string; edcText: string | null }) => {
      await fetch("/api/incidents/critical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId, edcText }),
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["critical"] }),
  });

  const items = data?.items ?? [];
  const abiertos = items.filter((it) => it.stillOpen).length;
  const cerrados = items.length - abiertos;

  const shown = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) =>
      [
        it.incidentId, it.openTime, it.status, it.company, it.serviceId,
        it.state, it.district, it.siteName ?? "", it.assignee ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [items, searchQuery]);

  // Textos EDC con contenido, en el orden mostrado (respeta el filtro de búsqueda).
  const edcTextsToCopy = useMemo(
    () =>
      shown
        .filter((it) => it.edcSource !== "sin-datos" && it.edcText.trim())
        .map((it) => it.edcText.trim()),
    [shown]
  );

  async function copyAllEdc() {
    if (edcTextsToCopy.length === 0) return;
    // Un formato por bloque, separados por una línea en blanco.
    const text = edcTextsToCopy.join("\n\n");
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
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1800);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-critical/40 bg-surface/40 backdrop-blur-md">
      {/* Barra superior: título, contadores, buscador, refrescar. */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-surface/80 p-2 backdrop-blur-md">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Flame className="h-4 w-4 text-critical" />
          <span>Mis incidentes críticos</span>
        </div>
        <span className="font-mono text-xs text-text-muted">
          {abiertos} abierto{abiertos === 1 ? "" : "s"}
          {cerrados > 0 && <span className="ml-1">· {cerrados} cerrado{cerrados === 1 ? "" : "s"}</span>}
        </span>
        <div className="relative ml-auto min-w-[14rem] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar en mis críticos…"
            className="h-9 w-full rounded-md border border-border bg-background/60 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={copyAllEdc}
          disabled={edcTextsToCopy.length === 0}
          title={
            edcTextsToCopy.length === 0
              ? "No hay formatos EDC con datos para copiar"
              : `Copiar los ${edcTextsToCopy.length} formato${edcTextsToCopy.length === 1 ? "" : "s"} EDC`
          }
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
            copiedAll
              ? "border-success/50 bg-success/10 text-success"
              : "border-violet-500/50 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
          )}
        >
          {copiedAll ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copiedAll
            ? "Copiado"
            : `Copiar EDC${edcTextsToCopy.length > 0 ? ` (${edcTextsToCopy.length})` : ""}`}
        </button>
        <button
          type="button"
          onClick={() => refetch()}
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
              <th className="w-10 border-b border-border/60 px-2 py-2 text-center">
                <Flame className="mx-auto h-3.5 w-3.5 text-critical" />
              </th>
              {COLS.map((c) => (
                <th
                  key={c}
                  className="border-b border-border/60 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-muted"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={COLS.length + 1} className="py-12 text-center text-sm text-text-muted">
                  {searchQuery
                    ? "Sin resultados para tu búsqueda"
                    : "Aún no has marcado incidentes como críticos. Usa el ícono 🔥 en cualquier vista de abiertos."}
                </td>
              </tr>
            ) : (
              shown.map((it) => (
                <Fragment key={it.incidentId}>
                <tr
                  className={cn(
                    "border-b border-border/40 transition-colors",
                    editingEdc === it.incidentId
                      ? "bg-violet-500/10"
                      : it.stillOpen
                      ? "bg-critical/5 hover:bg-critical/10"
                      : "opacity-60 hover:bg-surface-elevated/40"
                  )}
                >
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      title="Quitar de Críticos"
                      onClick={() => unmark.mutate(it.incidentId)}
                      className="mx-auto flex items-center justify-center text-text-muted hover:text-critical"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <HpsmIncidentId
                      incidentId={it.incidentId}
                      className="font-mono text-xs text-text-muted"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">
                    {it.openTime ? formatHpsm(it.openTime) : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <StatusCell status={it.status} stillOpen={it.stillOpen} />
                  </td>
                  <td className="px-3 py-2 text-xs text-text-primary">
                    <span className="block max-w-[12rem] truncate" title={it.company}>
                      {it.company}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">
                    <span className="block max-w-[11rem] truncate" title={it.serviceId}>
                      {it.serviceId}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-text-primary">{it.state}</td>
                  <td className="px-3 py-2 text-xs text-text-primary">{it.district}</td>
                  <td className="px-3 py-2 text-xs text-text-primary">
                    <span className="block max-w-[12rem] truncate" title={it.siteName ?? undefined}>
                      {it.siteName || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">{it.assignee ?? "—"}</td>
                  <td className="px-3 py-2">
                    <GroupBadge group={it.group} />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingEdc((cur) => (cur === it.incidentId ? null : it.incidentId))
                      }
                      title="Ver / editar el Formato EDC"
                      className={cn(
                        "flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                        editingEdc === it.incidentId
                          ? "border-violet-500 bg-violet-500/20 text-violet-200"
                          : it.edcEdited
                          ? "border-violet-500/50 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
                          : "border-border text-text-muted hover:text-text-primary"
                      )}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      EDC
                      {it.edcEdited && <span className="text-[10px]">✎</span>}
                    </button>
                  </td>
                </tr>
                {editingEdc === it.incidentId && (
                  <tr className="bg-violet-500/5">
                    <td colSpan={COLS.length + 1} className="px-3 pb-3 pt-0">
                      <EdcEditor
                        item={it}
                        saving={saveEdc.isPending}
                        onClose={() => setEditingEdc(null)}
                        onSave={(text) => saveEdc.mutate({ incidentId: it.incidentId, edcText: text })}
                        onRestore={() => saveEdc.mutate({ incidentId: it.incidentId, edcText: null })}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
