"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TIPOS_EVENTO,
  TIPO_LABEL,
  type Colaborador,
  type Evento,
  type TipoEvento,
} from "./types";

interface Props {
  colaborador: Colaborador;
  fecha: string; // YYYY-MM-DD
  horarioBase: string; // horario esperado ese día ("" = descanso)
  eventoExistente: Evento | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Panel de captura/edición de un evento para un (colaborador, día). */
export function EventoDialog({
  colaborador,
  fecha,
  horarioBase,
  eventoExistente,
  onClose,
  onSaved,
}: Props) {
  const [tipo, setTipo] = useState<TipoEvento>(eventoExistente?.tipo ?? "FALTA");
  const [nota, setNota] = useState(eventoExistente?.nota ?? "");
  const [fechaRel, setFechaRel] = useState(eventoExistente?.fechaRelacionada ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cierra con Escape.
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function guardar() {
    setError(null);
    setSaving(true);
    try {
      const esEdicion = Boolean(eventoExistente);
      const res = await fetch("/api/asistencia/eventos", {
        method: esEdicion ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          esEdicion
            ? { id: eventoExistente!.id, tipo, nota, fechaRelacionada: fechaRel }
            : { colaboradorId: colaborador.id, fecha, tipo, nota, fechaRelacionada: fechaRel },
        ),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Error al guardar");
        return;
      }
      onSaved();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function eliminar() {
    if (!eventoExistente) return;
    setSaving(true);
    await fetch(`/api/asistencia/eventos?id=${eventoExistente.id}`, { method: "DELETE" });
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-base font-semibold text-text-primary">{colaborador.nombre}</div>
        <div className="mb-4 text-xs text-text-muted">
          {fecha} ·{" "}
          {horarioBase ? (
            <span className="font-mono">{horarioBase}</span>
          ) : (
            <span className="italic">día de descanso según horario</span>
          )}
        </div>

        <label className="mb-1 block text-xs font-medium text-text-muted">Tipo de evento</label>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoEvento)}
          className="mb-3 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
        >
          {TIPOS_EVENTO.map((t) => (
            <option key={t} value={t}>
              {TIPO_LABEL[t]}
            </option>
          ))}
        </select>

        {tipo === "CAMBIO_DIA" && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-text-muted">
              Día que descansa a cambio (trabaja {fecha} en lugar de…)
            </label>
            <input
              type="date"
              value={fechaRel}
              onChange={(e) => setFechaRel(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            />
          </div>
        )}

        <label className="mb-1 block text-xs font-medium text-text-muted">Nota (opcional)</label>
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={2}
          placeholder="Motivo, folio de permiso, comentario…"
          className="mb-3 w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
        />

        {error && (
          <p className="mb-3 rounded-md border border-critical/40 bg-critical-dim px-3 py-2 text-xs text-critical">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between">
          <div>
            {eventoExistente && (
              <Button
                variant="destructive"
                size="sm"
                disabled={saving}
                onClick={eliminar}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" /> Quitar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={saving} onClick={onClose}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={saving}
              onClick={guardar}
              className="bg-accent text-white hover:bg-accent/90"
            >
              {eventoExistente ? "Guardar" : "Registrar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
