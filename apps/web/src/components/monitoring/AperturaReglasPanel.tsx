"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Bell, BellOff, PauseCircle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type WhatsappGroup } from "./GroupPicker";
import { AperturaReglaForm, EMPTY_REGLA, type ReglaFormState } from "./AperturaReglaForm";

interface AperturaRegla extends ReglaFormState {
  id: string;
  enabled: boolean;
}

async function fetchReglas(): Promise<{ reglas: AperturaRegla[]; pausado: boolean }> {
  const res = await fetch("/api/apertura-reglas");
  if (!res.ok) throw new Error("Error al cargar reglas");
  return res.json();
}

async function fetchGroups(): Promise<{ groups: WhatsappGroup[] }> {
  const res = await fetch("/api/whatsapp/groups");
  if (!res.ok) throw new Error("Error al cargar grupos");
  return res.json();
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-surface-elevated px-1.5 py-0.5 text-[11px]">
      <span className="text-text-muted">{label}</span>
      <span className="font-mono text-text-primary">{value}</span>
    </span>
  );
}

/**
 * Administración de las reglas de la alerta de apertura de incidente + el
 * interruptor global para pausar todos los avisos con un clic.
 */
export function AperturaReglasPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["apertura-reglas"], queryFn: fetchReglas });
  const { data: groupsData } = useQuery({ queryKey: ["whatsapp-groups"], queryFn: fetchGroups });
  const groups = groupsData?.groups ?? [];
  const groupName = useMemo(() => new Map(groups.map((g) => [g.chatId, g.name])), [groups]);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<ReglaFormState>(EMPTY_REGLA);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reglas = data?.reglas ?? [];
  const pausado = data?.pausado ?? false;

  const frequent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of reglas) for (const c of r.notifyChatIds) counts.set(c, (counts.get(c) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [reglas]);

  async function send(url: string, method: string, body?: unknown): Promise<{ omitidos?: number } | null> {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Error");
        return null;
      }
      qc.invalidateQueries({ queryKey: ["apertura-reglas"] });
      if (json.omitidos > 0) {
        setInfo(`${json.omitidos} incidente(s) ya abiertos cumplen la regla: se marcaron sin avisar. Solo se avisará de los nuevos.`);
      }
      return json;
    } catch {
      setError("Error de conexión");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    const ok =
      editingId === "new"
        ? await send("/api/apertura-reglas", "POST", form)
        : await send(`/api/apertura-reglas/${editingId}`, "PATCH", form);
    if (ok) setEditingId(null);
  }

  function startEdit(r: AperturaRegla | null) {
    setError(null);
    setEditingId(r ? r.id : "new");
    setForm(r ? { ...r } : EMPTY_REGLA);
  }

  function handleDelete(r: AperturaRegla) {
    if (!window.confirm(`¿Eliminar la regla "${r.nombre}"?`)) return;
    void send(`/api/apertura-reglas/${r.id}`, "DELETE");
  }

  function destino(r: AperturaRegla): string {
    const nombres = r.notifyChatIds.map((c) => groupName.get(c) || c);
    if (r.porTurno) nombres.unshift("Según turno");
    return nombres.join(", ");
  }

  const formEl = (
    <AperturaReglaForm
      value={form}
      onChange={setForm}
      groups={groups}
      frequent={frequent}
      busy={busy}
      onSave={handleSave}
      onCancel={() => setEditingId(null)}
    />
  );

  return (
    <div className="space-y-4">
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
          pausado ? "border-critical/40 bg-critical-dim" : "border-success/40 bg-success-dim"
        }`}
      >
        <div className="text-sm">
          <p className={`font-semibold ${pausado ? "text-critical" : "text-success"}`}>
            {pausado ? "Notificaciones PAUSADAS" : "Notificaciones activas"}
          </p>
          <p className="text-xs text-text-muted">
            {pausado
              ? "No se envía ningún aviso. Los incidentes que entren mientras tanto no se avisarán al reanudar."
              : "Se avisa de cada incidente nuevo que cumpla una regla activa."}
          </p>
        </div>
        <Button
          size="sm"
          disabled={busy || isLoading}
          onClick={() => void send("/api/apertura-reglas/pausa", "PUT", { pausado: !pausado })}
          className={`h-9 gap-1.5 text-xs text-white ${pausado ? "bg-success hover:bg-success/90" : "bg-critical hover:bg-critical/90"}`}
        >
          {pausado ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
          {pausado ? "Reanudar notificaciones" : "Pausar todas las notificaciones"}
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">Reglas ({reglas.length})</h2>
        <Button
          size="sm"
          onClick={() => startEdit(null)}
          className="h-8 gap-1.5 bg-accent text-xs text-white hover:bg-accent/90"
        >
          <Plus className="h-3.5 w-3.5" /> Nueva regla
        </Button>
      </div>

      {error && (
        <p className="rounded-md border border-critical/40 bg-critical-dim px-3 py-2 text-xs text-critical">{error}</p>
      )}
      {info && (
        <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-text-primary">{info}</p>
      )}

      {editingId === "new" && formEl}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-elevated text-left text-xs font-medium text-text-muted">
              <th className="px-4 py-2.5">Nombre</th>
              <th className="px-4 py-2.5">Criterios (todos deben cumplirse)</th>
              <th className="px-4 py-2.5">Destino</th>
              <th className="px-4 py-2.5">Estado</th>
              <th className="px-4 py-2.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">Cargando…</td>
              </tr>
            )}
            {!isLoading && reglas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">No hay reglas todavía</td>
              </tr>
            )}
            {reglas.map((r) =>
              editingId === r.id ? (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td colSpan={5} className="p-2">{formEl}</td>
                </tr>
              ) : (
                <tr
                  key={r.id}
                  className={`border-b border-border transition-colors last:border-0 hover:bg-surface-elevated/40 ${r.enabled ? "" : "opacity-50"}`}
                >
                  <td className="px-4 py-3 font-medium text-text-primary">{r.nombre}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.servicePrefixes && <Chip label="Servicio" value={r.servicePrefixes} />}
                      {r.imPrefixes && <Chip label="IM empieza" value={r.imPrefixes} />}
                      {r.companyContains && <Chip label="Empresa ∋" value={r.companyContains} />}
                    </div>
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-xs text-text-muted" title={destino(r)}>
                    {destino(r)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <button
                      disabled={busy}
                      onClick={() => void send(`/api/apertura-reglas/${r.id}`, "PATCH", { enabled: !r.enabled })}
                      className={`flex items-center gap-1 rounded border px-2 py-0.5 ${
                        r.enabled ? "border-success/40 bg-success-dim text-success" : "border-border text-text-muted"
                      }`}
                    >
                      {r.enabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                      {r.enabled ? "activa" : "desactivada"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(r)}
                        className="h-7 w-7 p-0 text-text-muted hover:bg-surface-elevated hover:text-text-primary">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleDelete(r)}
                        className="h-7 w-7 p-0 text-text-muted hover:bg-critical-dim hover:text-critical">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
