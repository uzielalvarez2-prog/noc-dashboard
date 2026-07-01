"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, X, CopyCheck } from "lucide-react";

interface EdcReport {
  incidentId: string;
  rawText: string;
  sentAt: string;
}

async function fetchReports(): Promise<EdcReport[]> {
  const res = await fetch("/api/edc-reports");
  if (!res.ok) throw new Error("Error al obtener reportes");
  const data = (await res.json()) as { reports: EdcReport[] };
  return data.reports;
}

// Servicio UP/recuperado si la línea "Estatus:" del reporte lo indica. Se limita
// a esa línea (si existe) para no dar falsos positivos con el resto del mensaje;
// si no hay línea "Estatus:", se evalúa el texto completo. Mismo espíritu que el
// `isResolvedStatus` de War Room, ampliado con up/restablecido/normalizado.
function isServiceUp(rawText: string): boolean {
  const m = rawText.match(/estatus\s*:\s*(.*)/i);
  const scope = m ? m[1] : rawText;
  return /\bup\b|resuelt|resolv|restablec|normaliz|operativ/i.test(scope);
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

function ReportCard({
  report,
  onDismiss,
}: {
  report: EdcReport;
  onDismiss: (incidentId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const up = isServiceUp(report.rawText);

  async function copy() {
    try {
      await navigator.clipboard.writeText(report.rawText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard no disponible (contexto inseguro): no rompe la vista */
    }
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        {/* Número de incidente: verde neón si el servicio está UP, rojo neón si no. */}
        <span
          className={
            up
              ? "font-mono text-xs font-semibold text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.9)]"
              : "font-mono text-xs font-semibold text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]"
          }
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

  async function copyAll() {
    if (!data || data.length === 0) return;
    const all = data.map((r) => r.rawText).join("\n\n──────────\n\n");
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
          <ReportCard key={r.incidentId} report={r} onDismiss={dismiss} />
        ))}
      </div>
    </div>
  );
}
