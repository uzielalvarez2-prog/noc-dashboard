"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CaseNota {
  id: string;
  incidentId: string;
  texto: string;
  autor: string;
  createdAt: string;
}

// createdAt es un timestamp real de DB (UTC) → se muestra en hora de México.
export function formatNotaFecha(date: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Mexico_City",
  }).format(new Date(date));
}

// Bitácora "Estatus CASE" de un IM: captura de nota nueva (solo CASE/ADMIN) y
// lista de entradas, la más reciente arriba, cada una con su botón Copiar.
export function CaseNotasPanel({
  incidentId,
  notas,
  puedeEditar,
  onGuardada,
}: {
  incidentId: string;
  notas: CaseNota[];
  puedeEditar: boolean;
  onGuardada: () => Promise<unknown>;
}) {
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      const res = await fetch("/api/case-san-juan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId, texto }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "No se pudo guardar la nota");
        return;
      }
      setTexto("");
      await onGuardada();
    } catch {
      setError("Error de conexión");
    } finally {
      setGuardando(false);
    }
  }

  async function copiar(nota: CaseNota) {
    try {
      await navigator.clipboard.writeText(nota.texto);
      setCopiadoId(nota.id);
      setTimeout(() => setCopiadoId(null), 1500);
    } catch {
      /* clipboard no disponible (contexto inseguro) */
    }
  }

  return (
    <div className="space-y-3">
      {puedeEditar && (
        <div className="space-y-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            placeholder={`Nueva nota de Estatus CASE para ${incidentId}…`}
            className="w-full rounded-md border border-border bg-background p-2 text-xs text-text-primary"
          />
          <div className="flex items-center justify-end gap-3">
            {error && <span className="text-xs text-critical">{error}</span>}
            <Button size="sm" onClick={guardar} disabled={guardando || !texto.trim()}>
              {guardando ? <Loader2 className="animate-spin" /> : <Save />}
              Guardar nota
            </Button>
          </div>
        </div>
      )}

      {notas.length === 0 ? (
        <p className="text-xs text-text-muted">Sin notas todavía.</p>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {notas.map((n) => (
            <li key={n.id} className="rounded-md border border-border bg-background p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[11px] text-text-muted">
                  {formatNotaFecha(n.createdAt)} · {n.autor}
                </span>
                <Button variant="outline" size="sm" onClick={() => void copiar(n)}>
                  {copiadoId === n.id ? <Check /> : <Copy />}
                  {copiadoId === n.id ? "Copiado" : "Copiar"}
                </Button>
              </div>
              <p className="whitespace-pre-wrap text-xs text-text-primary">{n.texto}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
