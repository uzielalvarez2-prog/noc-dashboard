"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Check } from "lucide-react";

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

function ReportCard({ report }: { report: EdcReport }) {
  const [copied, setCopied] = useState(false);

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
        <span className="font-mono text-xs text-critical">{report.incidentId}</span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
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
  const { data, isLoading } = useQuery<EdcReport[]>({
    queryKey: ["edc-reports"],
    queryFn: fetchReports,
    refetchInterval: 60_000,
  });

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
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.map((r) => (
        <ReportCard key={r.incidentId} report={r} />
      ))}
    </div>
  );
}
