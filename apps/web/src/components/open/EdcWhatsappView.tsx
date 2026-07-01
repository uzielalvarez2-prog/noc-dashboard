"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, X, CopyCheck, StickyNote, Pencil } from "lucide-react";

interface EdcReport {
  incidentId: string;
  rawText: string;
  sentAt: string;
  status: string; // estatus HPSM del incidente (tabla de abiertos)
  note: string; // nota del equipo (compartida con EDC → Escalados)
}

// Texto a copiar de un reporte: el bloque de WhatsApp + la nota si existe.
function reportCopyText(r: EdcReport): string {
  return r.note && r.note.trim() ? `${r.rawText}\n\nNota: ${r.note.trim()}` : r.rawText;
}

async function fetchReports(): Promise<EdcReport[]> {
  const res = await fetch("/api/edc-reports");
  if (!res.ok) throw new Error("Error al obtener reportes");
  const data = (await res.json()) as { reports: EdcReport[] };
  return data.reports;
}

// Color NEÓN del número de incidente según el estatus HPSM real (de la tabla
// general de abiertos, que el scraper refresca cada ~5 min), NO según el texto
// de WhatsApp: RESOLVED = verde, WORK IN PROGRESS = ámbar, el resto (PENDING
// CUSTOMER/VENDOR/OTHER/EVIDENCE, CATEGORIZE) = rojo.
function statusNeonClass(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("RESOLVED")) {
    return "text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.9)]";
  }
  if (s.includes("PROGRESS")) {
    return "text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]";
  }
  return "text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]";
}

// Convierte las *negritas* de WhatsApp (`*texto*` → <strong>) sin tocar el resto
// del bloque. Los saltos de línea se respetan con `whitespace-pre-wrap` en el
// contenedor, así que el mensaje se ve igual que en el grupo.
function renderWhatsappBold(text: string) {
  return text.split(/(\*[^*\n]+\*)/g).map((part, i) =>
    /^\*[^*\n]+\*$/.test(part) ? (
      <strong key={i} className="font-semibold text-text-primary">
        {part.slice(1, -1)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function formatSentAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// Nota discreta editable bajo la fecha. Click para editar; Enter guarda, Esc
// cancela. Sin nota, solo un ícono tenue que revela "Agregar nota" al pasar.
function NoteRow({ note, onSave }: { note: string; onSave: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);

  if (editing) {
    return (
      <div className="mt-2 flex items-center gap-1">
        <StickyNote className="h-3 w-3 shrink-0 text-text-muted/60" />
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onSave(draft.trim()); setEditing(false); }
            if (e.key === "Escape") { setDraft(note); setEditing(false); }
          }}
          placeholder="Nota…"
          className="flex-1 rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] text-text-primary focus:border-accent focus:outline-none"
        />
        <button onClick={() => { onSave(draft.trim()); setEditing(false); }} title="Guardar" className="text-success hover:opacity-80">
          <Check className="h-3 w-3" />
        </button>
        <button onClick={() => { setDraft(note); setEditing(false); }} title="Cancelar" className="text-text-muted hover:text-text-primary">
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(note); setEditing(true); }}
      title={note ? "Editar nota" : "Agregar nota"}
      className="group mt-2 flex w-full items-center gap-1 text-left text-[11px] italic text-text-muted/70 transition-colors hover:text-text-primary"
    >
      <StickyNote className="h-3 w-3 shrink-0 opacity-70" />
      {note ? (
        <span className="truncate">{note}</span>
      ) : (
        <span className="not-italic opacity-0 transition-opacity group-hover:opacity-100">Agregar nota</span>
      )}
      <Pencil className="ml-auto h-2.5 w-2.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  );
}

function ReportCard({
  report,
  onDismiss,
  onSaveNote,
}: {
  report: EdcReport;
  onDismiss: (incidentId: string) => void;
  onSaveNote: (incidentId: string, note: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(reportCopyText(report));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard no disponible (contexto inseguro): no rompe la vista */
    }
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        {/* Número de incidente coloreado por el estatus HPSM (verde/ámbar/rojo neón). */}
        <span
          title={report.status || undefined}
          className={`font-mono text-xs font-semibold ${statusNeonClass(report.status)}`}
        >
          {report.incidentId}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
          <button
            type="button"
            onClick={() => onDismiss(report.incidentId)}
            title="Quitar esta tarjeta"
            aria-label="Quitar tarjeta"
            className="flex items-center rounded-md border border-border p-1 text-text-muted transition-colors hover:border-critical hover:text-critical"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="whitespace-pre-wrap break-words text-sm text-text-muted">
        {renderWhatsappBold(report.rawText)}
      </div>

      {report.sentAt && (
        <div className="mt-3 font-mono text-[11px] text-text-muted/70">
          {formatSentAt(report.sentAt)}
        </div>
      )}

      <NoteRow note={report.note} onSave={(n) => onSaveNote(report.incidentId, n)} />
    </div>
  );
}

// Reportes del grupo de WhatsApp "STAFF SUPERVISIÓN" que siguen abiertos.
// Refresca cada 60s; el cross-ref con abiertos lo hace el API (los resueltos
// desaparecen solos en el siguiente refresh).
export function EdcWhatsappView() {
  const queryClient = useQueryClient();
  const [copiedAll, setCopiedAll] = useState(false);

  const { data, isLoading } = useQuery<EdcReport[]>({
    queryKey: ["edc-reports"],
    queryFn: fetchReports,
    refetchInterval: 60_000,
  });

  // Quita la tarjeta del dashboard (borra el reporte). Optimista: la saca de la
  // caché de inmediato y persiste en la DB vía DELETE.
  async function dismiss(incidentId: string) {
    queryClient.setQueryData<EdcReport[]>(["edc-reports"], (old) =>
      old ? old.filter((r) => r.incidentId !== incidentId) : old
    );
    try {
      await fetch(`/api/edc-reports?incidentId=${encodeURIComponent(incidentId)}`, {
        method: "DELETE",
      });
    } catch {
      /* si falla, el refetch de 60s la reincorpora */
    } finally {
      queryClient.invalidateQueries({ queryKey: ["edc-reports"] });
    }
  }

  // Guarda la nota (compartida con EDC → Escalados vía EscalatedIncident).
  async function saveNote(incidentId: string, note: string) {
    queryClient.setQueryData<EdcReport[]>(["edc-reports"], (old) =>
      old ? old.map((r) => (r.incidentId === incidentId ? { ...r, note } : r)) : old
    );
    try {
      await fetch("/api/incidents/escalated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId, escalated: true, note }),
      });
    } finally {
      queryClient.invalidateQueries({ queryKey: ["edc-reports"] });
      queryClient.invalidateQueries({ queryKey: ["edc-escalados"] });
    }
  }

  async function copyAll() {
    if (!data || data.length === 0) return;
    const all = data.map((r) => reportCopyText(r)).join("\n\n──────────\n\n");
    try {
      await navigator.clipboard.writeText(all);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      /* clipboard no disponible (contexto inseguro): no rompe la vista */
    }
  }

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-text-muted">Cargando reportes…</div>;
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-text-muted">
        Sin reportes activos en el grupo
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">{data.length} reporte(s) activo(s)</span>
        <button
          type="button"
          onClick={copyAll}
          className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
        >
          {copiedAll ? <CopyCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copiedAll ? "Copiados" : "Copiar todos"}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map((r) => (
          <ReportCard key={r.incidentId} report={r} onDismiss={dismiss} onSaveNote={saveNote} />
        ))}
      </div>
    </div>
  );
}
