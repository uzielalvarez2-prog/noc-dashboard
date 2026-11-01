"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, Eraser, Loader2, Lock, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  extraerIms,
  resultadoLabel,
  MAX_CERRAR,
  type CierreResult,
  type ModoCierre,
  type ProgresoCierre,
} from "@/lib/cerrarIncidentes";
import { TEMPLATES_CIERRE } from "@/lib/templatesCierre";

interface ProgresoResponse {
  progreso: ProgresoCierre;
  resultados: CierreResult[];
}

async function fetchProgreso(): Promise<ProgresoResponse> {
  const res = await fetch("/api/cerrar-incidentes");
  const body = (await res.json()) as ProgresoResponse & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Error al leer el progreso");
  return body;
}

const EN_CURSO: ProgresoCierre["estado"][] = ["en_cola", "cerrando"];

function resultadoClass(r: CierreResult): string {
  if (r.resultado === "cerrado") return "text-success";
  if (r.resultado === "verificado" || r.resultado === "aplicado") return "text-info";
  if (r.resultado === "ya-cerrado") return "text-text-muted";
  if (r.resultado === "template-no-existe" || r.resultado === "no-encontrado") return "text-warning";
  return "text-critical";
}

const MODO_LABEL: Record<ModoCierre, string> = {
  verificar: "Verificar (sin tocar nada)",
  aplicar: "Aplicar template (sin cerrar)",
  cerrar: "Cerrar de verdad",
};

export function CerrarIncidentesPanel() {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [template, setTemplate] = useState(TEMPLATES_CIERRE[0] ?? "");
  const [modo, setModo] = useState<ModoCierre>("verificar");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [limpio, setLimpio] = useState(false);
  // Confirmación extra para el modo "cerrar" (irreversible).
  const [confirmando, setConfirmando] = useState(false);

  const { data, error: errorProgreso } = useQuery({
    queryKey: ["cerrar-incidentes"],
    queryFn: fetchProgreso,
    refetchInterval: (q) => (q.state.data && EN_CURSO.includes(q.state.data.progreso.estado) ? 3_000 : false),
  });

  const ims = extraerIms(texto);
  const progreso = data?.progreso;
  const resultados = limpio ? [] : (data?.resultados ?? []);
  const enCurso = progreso ? EN_CURSO.includes(progreso.estado) : false;
  const cerrados = resultados.filter((r) => r.resultado === "cerrado").length;

  async function lanzar() {
    setError(null);
    setLimpio(false);
    setConfirmando(false);
    setEnviando(true);
    try {
      const items = ims.map((im) => ({ im, template }));
      const res = await fetch("/api/cerrar-incidentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, modo }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "No se pudo iniciar la corrida");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["cerrar-incidentes"] });
    } catch {
      setError("Error de conexión");
    } finally {
      setEnviando(false);
    }
  }

  // En modo "cerrar", el botón pide una segunda confirmación antes de lanzar.
  function onAccion() {
    if (modo === "cerrar" && !confirmando) {
      setConfirmando(true);
      return;
    }
    void lanzar();
  }

  async function copiar() {
    try {
      const txt = resultados.map((r) => `${r.im}\t${resultadoLabel(r)}\t${r.mensaje}`).join("\n");
      await navigator.clipboard.writeText(txt);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* clipboard no disponible */
    }
  }

  function limpiar() {
    setTexto("");
    setError(null);
    setConfirmando(false);
    setLimpio(true);
  }

  const bloqueado = enviando || enCurso || ims.length === 0 || ims.length > MAX_CERRAR || !template;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <label htmlFor="ims" className="text-sm font-semibold text-text-primary">
          Incidentes a cerrar
        </label>
        <textarea
          id="ims"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setConfirmando(false);
          }}
          rows={9}
          placeholder={"IMCNIE002997\nIMAADX006635\n…"}
          className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-text-primary"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="template" className="text-xs font-semibold text-text-muted">
              Template a aplicar
            </label>
            <select
              id="template"
              value={template}
              onChange={(e) => {
                setTemplate(e.target.value);
                setConfirmando(false);
              }}
              className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-text-primary"
            >
              {TEMPLATES_CIERRE.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="modo" className="text-xs font-semibold text-text-muted">
              Modo
            </label>
            <select
              id="modo"
              value={modo}
              onChange={(e) => {
                setModo(e.target.value as ModoCierre);
                setConfirmando(false);
              }}
              className="w-full rounded-md border border-border bg-background p-2 text-xs text-text-primary"
            >
              {(Object.keys(MODO_LABEL) as ModoCierre[]).map((m) => (
                <option key={m} value={m}>
                  {MODO_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className={ims.length > MAX_CERRAR ? "text-xs text-critical" : "text-xs text-text-muted"}>
            {ims.length} IMs detectados{ims.length > MAX_CERRAR ? ` (máximo ${MAX_CERRAR})` : ""}
          </span>
          <Button
            onClick={onAccion}
            disabled={bloqueado}
            variant={modo === "cerrar" ? (confirmando ? "destructive" : "default") : "default"}
          >
            {enviando || enCurso ? (
              <Loader2 className="animate-spin" />
            ) : modo === "cerrar" ? (
              confirmando ? <AlertTriangle /> : <Lock />
            ) : (
              <PlayCircle />
            )}
            {enviando || enCurso
              ? "Procesando…"
              : modo === "cerrar"
                ? confirmando
                  ? `Confirmar cierre de ${ims.length} IM(s)`
                  : "Cerrar en HPSM"
                : modo === "aplicar"
                  ? "Aplicar template"
                  : "Verificar"}
          </Button>
        </div>

        {modo === "cerrar" && confirmando && (
          <p className="rounded-md border border-critical/40 bg-critical-dim p-2 text-xs text-critical">
            Esto cierra {ims.length} incidente(s) de verdad en HPSM con el template{" "}
            <span className="font-mono">{template}</span>. Es irreversible. Vuelve a apretar para confirmar.
          </p>
        )}

        {error && <p className="text-xs text-critical">{error}</p>}
        {errorProgreso && <p className="text-xs text-critical">{(errorProgreso as Error).message}</p>}
        {progreso && progreso.estado !== "inactivo" && !limpio && (
          <p className="text-xs text-text-muted">
            {progreso.estado === "en_cola" && "En cola: esperando a que el scraper termine su corrida de HPSM…"}
            {progreso.estado === "cerrando" && `Procesando… ${resultados.length} de ${progreso.total}`}
            {(progreso.estado === "terminado" || progreso.estado === "error") && progreso.mensaje}
          </p>
        )}
      </section>

      <section className="flex flex-col space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-text-primary">
            Resultados{cerrados > 0 ? ` — ${cerrados} cerrado(s)` : ""}
          </span>
          <div className="flex items-center gap-2">
            {resultados.length > 0 && (
              <Button variant="outline" size="sm" onClick={limpiar} disabled={enCurso}>
                <Eraser />
                Limpiar
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={copiar} disabled={resultados.length === 0}>
              {copiado ? <Check /> : <Copy />}
              {copiado ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>

        {resultados.length > 0 ? (
          <div className="max-h-[32rem] overflow-y-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <tbody>
                {resultados.map((r) => (
                  <tr key={r.im} className="border-t border-border first:border-t-0 align-top">
                    <td className="py-2 pl-3 pr-3 font-mono text-text-primary whitespace-nowrap">{r.im}</td>
                    <td className="py-2 pr-3">
                      <span className={`font-semibold ${resultadoClass(r)}`}>{resultadoLabel(r)}</span>
                      <p className="mt-0.5 text-text-muted">{r.mensaje}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-md border border-border bg-background p-3 text-xs text-text-muted">
            Aquí aparece el resultado de cada IM conforme se procesa. En modo &quot;Verificar&quot; nada se
            modifica; solo comprueba que el incidente existe y que el template está disponible.
          </p>
        )}
      </section>
    </div>
  );
}
