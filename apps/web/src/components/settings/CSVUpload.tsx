"use client";

import { useState, useRef } from "react";
import { Upload, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

interface UploadResult {
  ok: boolean;
  total: number;
  filtered: number;
  upserted: number;
  message: string;
  error?: string;
}

export function CSVUpload() {
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
    form.append("group", "PEXA");

    try {
      const res = await fetch("/api/incidents/upload", { method: "POST", body: form });
      const data: UploadResult = await res.json();
      setResult(data);

      if (data.ok) {
        // Refrescar KPIs e incidentes en el dashboard
        qc.invalidateQueries({ queryKey: ["kpis"] });
        qc.invalidateQueries({ queryKey: ["incidents"] });
        qc.invalidateQueries({ queryKey: ["sla"] });
      }
    } catch {
      setResult({ ok: false, total: 0, filtered: 0, upserted: 0, message: "", error: "Error de conexión" });
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
    if (file?.name.endsWith(".csv")) uploadFile(file);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Upload className="h-4 w-4 text-text-muted" />
        <h2 className="text-base font-semibold text-text-primary">
          Importar incidentes HPSM
        </h2>
      </div>

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
          Arrastra el CSV aquí o haz clic para seleccionar
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Exporta desde HPSM: <span className="text-accent">More → Export to text file → CSV</span>
        </p>
        <p className="mt-1 text-xs text-text-disabled">
          Solo incidentes del grupo <span className="text-accent font-medium">PEXA</span> serán importados
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
        <div className={`rounded-lg border p-4 ${result.ok ? "border-success/40 bg-success-dim" : "border-critical/40 bg-critical-dim"}`}>
          <div className="flex items-start gap-2">
            {result.ok ? (
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
            )}
            <div>
              <p className={`text-sm font-medium ${result.ok ? "text-success" : "text-critical"}`}>
                {result.ok ? result.message : result.error}
              </p>
              {result.ok && (
                <p className="mt-1 text-xs text-text-muted">
                  CSV total: {result.total} registros → PEXA únicos: {result.filtered} → Guardados: {result.upserted}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-text-muted">
        Flujo: HPSM portal → lista de incidentes → More → Export to text file → CSV → subir aquí. El sistema deduplica por ID y solo importa PEXA.
      </p>
    </div>
  );
}
