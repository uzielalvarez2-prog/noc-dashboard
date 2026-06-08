"use client";

import { useState, useRef } from "react";
import { Upload, CheckCircle, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

type Kind = "open" | "closed";
type Group = "PEXA" | "CECOR";

interface UploadResult {
  ok?: boolean;
  message?: string;
  error?: string;
}

export function CSVUpload() {
  const [kind, setKind] = useState<Kind>("open");
  const [group, setGroup] = useState<Group>("PEXA");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  async function uploadFile(file: File) {
    setLoading(true);
    setResult(null);

    const form = new FormData();
    form.append("file", file);
    const endpoint =
      kind === "open" ? "/api/incidents/open/upload" : "/api/incidents/closed/upload";
    if (kind === "closed") form.append("group", group);

    try {
      const res = await fetch(endpoint, { method: "POST", body: form });
      const data: UploadResult = await res.json();
      setResult(data);
      if (data.ok) {
        qc.invalidateQueries({ queryKey: ["open-incidents"] });
        qc.invalidateQueries({ queryKey: ["open-stats"] });
        qc.invalidateQueries({ queryKey: ["closed-stats"] });
      }
    } catch {
      setResult({ ok: false, error: "Error de conexión" });
    } finally {
      setLoading(false);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.name.toLowerCase().endsWith(".csv")) uploadFile(file);
  }

  const tabBtn = (k: Kind, label: string) =>
    `flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      kind === k
        ? "bg-accent text-white"
        : "text-text-muted hover:text-text-primary"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Upload className="h-4 w-4 text-text-muted" />
        <h2 className="text-base font-semibold text-text-primary">Importar CSV de HPSM</h2>
      </div>

      {/* Selector tipo de carga */}
      <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        <button type="button" className={tabBtn("open", "Abiertos")} onClick={() => { setKind("open"); setResult(null); }}>
          Abiertos
        </button>
        <button type="button" className={tabBtn("closed", "Cerrados")} onClick={() => { setKind("closed"); setResult(null); }}>
          Cerrados
        </button>
      </div>

      {/* Selector de grupo (solo cerrados; los abiertos traen el grupo en el CSV) */}
      {kind === "closed" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Grupo del archivo:</span>
          {(["PEXA", "CECOR"] as Group[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                group === g
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-text-muted hover:text-text-primary"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"
        }`}
      >
        <Upload className="mx-auto mb-3 h-8 w-8 text-text-muted" />
        <p className="text-sm font-medium text-text-primary">
          Arrastra el CSV de {kind === "open" ? "abiertos" : `cerrados (${group})`} aquí o haz clic
        </p>
        <p className="mt-1 text-xs text-text-muted">
          {kind === "open"
            ? "Se filtran PEXA + CECOR, se quitan duplicados y se reemplaza el tablero."
            : "Calcula el SLA de 4 h con la hora de apertura y cierre."}
        </p>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
      </div>

      {/* Estado */}
      {loading && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span className="text-sm text-text-muted">Procesando CSV...</span>
        </div>
      )}

      {result && !loading && (
        <div
          className={`rounded-lg border p-4 ${
            result.ok ? "border-success/40 bg-success-dim" : "border-critical/40 bg-critical-dim"
          }`}
        >
          <div className="flex items-start gap-2">
            {result.ok ? (
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
            )}
            <p className={`text-sm font-medium ${result.ok ? "text-success" : "text-critical"}`}>
              {result.ok ? result.message : result.error}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
