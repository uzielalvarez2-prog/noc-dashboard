"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Eraser, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  extraerIms,
  textoWhatsapp,
  MAX_IMS,
  type ImEstatusResult,
  type ProgresoIm,
} from "@/lib/imEstatus";

interface ProgresoResponse {
  progreso: ProgresoIm;
  resultados: ImEstatusResult[];
}

async function fetchProgreso(): Promise<ProgresoResponse> {
  const res = await fetch("/api/im-estatus");
  const body = (await res.json()) as ProgresoResponse & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Error al leer el progreso");
  return body;
}

const EN_CURSO: ProgresoIm["estado"][] = ["en_cola", "consultando"];

function estatusClass(r: ImEstatusResult): string {
  if (r.error || !r.found) return "text-text-muted";
  if (r.cerrado) return "text-success";
  if ((r.status ?? "").toUpperCase().includes("PENDING")) return "text-warning";
  return "text-info";
}

function estatusLabel(r: ImEstatusResult): string {
  if (r.error) return "Error al consultar";
  if (!r.found) return "No encontrado";
  if (r.cerrado) return "Cerrado";
  return r.status || "(sin estatus)";
}

export function ImEstatusPanel() {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [copiadoTabla, setCopiadoTabla] = useState(false);
  // "Limpiar" solo oculta en pantalla: los resultados siguen en el worker hasta la próxima consulta.
  const [limpio, setLimpio] = useState(false);

  const { data, error: errorProgreso } = useQuery({
    queryKey: ["im-estatus"],
    queryFn: fetchProgreso,
    refetchInterval: (q) => (q.state.data && EN_CURSO.includes(q.state.data.progreso.estado) ? 3_000 : false),
  });

  const ims = extraerIms(texto);
  const progreso = data?.progreso;
  const resultados = limpio ? [] : (data?.resultados ?? []);
  const enCurso = progreso ? EN_CURSO.includes(progreso.estado) : false;
  const salida = textoWhatsapp(resultados);

  async function consultar() {
    setError(null);
    setLimpio(false);
    setEnviando(true);
    try {
      const res = await fetch("/api/im-estatus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ims }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "No se pudo iniciar la consulta");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["im-estatus"] });
    } catch {
      setError("Error de conexión");
    } finally {
      setEnviando(false);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(salida);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* clipboard no disponible (contexto inseguro) */
    }
  }

  async function copiarTabla() {
    try {
      await navigator.clipboard.writeText(resultados.map((r) => `${r.im}\t${estatusLabel(r)}`).join("\n"));
      setCopiadoTabla(true);
      setTimeout(() => setCopiadoTabla(false), 1500);
    } catch {
      /* clipboard no disponible (contexto inseguro) */
    }
  }

  function limpiar() {
    setTexto("");
    setError(null);
    setLimpio(true);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <label htmlFor="ims" className="text-sm font-semibold text-text-primary">
          Incidentes a consultar
        </label>
        <textarea
          id="ims"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={10}
          placeholder={"IMCNIE002997\nIMAADX006635\n…"}
          className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-text-primary"
        />
        <div className="flex items-center justify-between gap-3">
          <span className={ims.length > MAX_IMS ? "text-xs text-critical" : "text-xs text-text-muted"}>
            {ims.length} IMs detectados{ims.length > MAX_IMS ? ` (máximo ${MAX_IMS})` : ""}
          </span>
          <Button
            onClick={consultar}
            disabled={enviando || enCurso || ims.length === 0 || ims.length > MAX_IMS}
          >
            {enviando || enCurso ? <Loader2 className="animate-spin" /> : <Search />}
            Consultar en HPSM
          </Button>
        </div>
        {error && <p className="text-xs text-critical">{error}</p>}
        {errorProgreso && <p className="text-xs text-critical">{(errorProgreso as Error).message}</p>}
        {progreso && progreso.estado !== "inactivo" && !limpio && (
          <p className="text-xs text-text-muted">
            {progreso.estado === "en_cola" && "En cola: esperando a que el scraper termine su corrida de HPSM…"}
            {progreso.estado === "consultando" && `Consultando… ${resultados.length} de ${progreso.total}`}
            {(progreso.estado === "terminado" || progreso.estado === "error") && progreso.mensaje}
          </p>
        )}

        {resultados.length > 0 && (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={limpiar} disabled={enCurso}>
              <Eraser />
              Limpiar
            </Button>
            <Button variant="outline" size="sm" onClick={copiarTabla}>
              {copiadoTabla ? <Check /> : <Copy />}
              {copiadoTabla ? "Copiado" : "Copiar"}
            </Button>
          </div>
        )}
        {resultados.length > 0 && (
          <table className="w-full text-xs">
            <tbody>
              {resultados.map((r) => (
                <tr key={r.im} className="border-t border-border">
                  <td className="py-2 pr-3 font-mono text-text-primary">{r.im}</td>
                  <td className={`py-2 font-semibold ${estatusClass(r)}`}>{estatusLabel(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-text-primary">Texto para WhatsApp</span>
          <Button variant="outline" size="sm" onClick={copiar} disabled={!salida}>
            {copiado ? <Check /> : <Copy />}
            {copiado ? "Copiado" : "Copiar"}
          </Button>
        </div>
        <pre className="min-h-64 flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 font-mono text-xs text-text-primary">
          {salida || "Aquí aparece el resultado conforme se consulta cada IM."}
        </pre>
        <p className="text-xs text-text-muted">
          Por IM: estatus actual y las 3 actividades más recientes de la bitácora (primera línea de cada
          nota). Los cerrados solo dicen &quot;Cerrado&quot;.
        </p>
      </section>
    </div>
  );
}
