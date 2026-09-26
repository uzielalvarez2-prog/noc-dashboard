"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, Plus, Pencil, Trash2, Check, X, Search, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GroupPicker, type WhatsappGroup } from "./GroupPicker";

interface WatchedServiceFlag {
  id: string;
  serviceRef: string;
  note: string;
  notifyChatIds: string[];
  enabled: boolean;
  createdAt: string;
}

async function fetchFlags(): Promise<{ flags: WatchedServiceFlag[] }> {
  const res = await fetch("/api/watched-services");
  if (!res.ok) throw new Error("Error al cargar servicios");
  return res.json();
}

async function fetchGroups(): Promise<{ groups: WhatsappGroup[] }> {
  const res = await fetch("/api/whatsapp/groups");
  if (!res.ok) throw new Error("Error al cargar grupos");
  return res.json();
}

interface FormState {
  serviceRef: string;
  note: string;
  notifyChatIds: string[];
}

const EMPTY_FORM: FormState = { serviceRef: "", note: "", notifyChatIds: [] };

/**
 * Administración de "Servicios en posible baja": el ADMIN marca un número de
 * Servicio (REF completo, ej. "C20-2210-0003") que ya identificó como
 * probablemente dado de baja en HPSM. Si ese Servicio exacto vuelve a
 * aparecer en Incidentes Abiertos, se avisa por WhatsApp a los grupos
 * elegidos aquí, una sola vez por incidente. Mismo patrón visual que
 * MonitoredIpsPanel.
 */
export function WatchedServicesPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["watched-services"], queryFn: fetchFlags });
  const { data: groupsData } = useQuery({ queryKey: ["whatsapp-groups"], queryFn: fetchGroups });
  const groups = groupsData?.groups ?? [];

  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["watched-services"] });
  }

  async function handleAdd() {
    if (!form.serviceRef.trim()) {
      setError("El número de Servicio es requerido");
      return;
    }
    if (form.notifyChatIds.length === 0) {
      setError("Elige al menos un grupo destino");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/watched-services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Error al agregar");
        return;
      }
      setForm(EMPTY_FORM);
      setAdding(false);
      invalidate();
    } catch {
      setError("Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(id: string) {
    if (editForm.notifyChatIds.length === 0) {
      setError("Elige al menos un grupo destino");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/watched-services/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Error al guardar");
        return;
      }
      setEditingId(null);
      invalidate();
    } catch {
      setError("Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(item: WatchedServiceFlag) {
    setBusy(true);
    try {
      await fetch(`/api/watched-services/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !item.enabled }),
      });
      invalidate();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/watched-services/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError((await res.json()).error ?? "Error al eliminar");
        return;
      }
      invalidate();
    } catch {
      setError("Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(item: WatchedServiceFlag) {
    setEditingId(item.id);
    setEditForm({ serviceRef: item.serviceRef, note: item.note, notifyChatIds: item.notifyChatIds });
  }

  const all = data?.flags ?? [];

  const frequentChatIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of all) {
      for (const chatId of item.notifyChatIds) {
        counts.set(chatId, (counts.get(chatId) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([chatId]) => chatId);
  }, [all]);

  const q = filter.trim().toLowerCase();
  const items = q
    ? all.filter((f) => f.serviceRef.toLowerCase().includes(q) || f.note.toLowerCase().includes(q))
    : all;

  const inputCls =
    "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertOctagon className="h-4 w-4 text-text-muted" />
          <h2 className="text-base font-semibold text-text-primary">Servicios en posible baja</h2>
          <span className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
            {all.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar (Servicio, nota)..."
              className="rounded-md border border-border bg-surface py-1.5 pl-7 pr-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
            />
          </div>
          <Button
            size="sm"
            onClick={() => setAdding(true)}
            className="h-8 gap-1.5 bg-accent text-xs text-white hover:bg-accent/90"
          >
            <Plus className="h-3.5 w-3.5" /> Marcar servicio
          </Button>
        </div>
      </div>

      <p className="text-xs text-text-muted">
        Si el número de Servicio marcado aquí vuelve a aparecer en un incidente
        nuevo de Incidentes Abiertos, se manda WhatsApp una sola vez a los
        grupos elegidos con la nota capturada (o el texto genérico "REVISAR
        PREVIOS, Posible baja" si la dejas vacía).
      </p>

      {error && (
        <p className="rounded-md border border-critical/40 bg-critical-dim px-3 py-2 text-xs text-critical">
          {error}
        </p>
      )}

      {adding && (
        <div className="space-y-3 rounded-lg border border-border bg-accent/5 p-3">
          <input
            autoFocus
            placeholder="Número de Servicio (REF completo, ej. C20-2210-0003)"
            value={form.serviceRef}
            onChange={(e) => setForm({ ...form, serviceRef: e.target.value })}
            className={inputCls}
          />
          <input
            placeholder="Nota (opcional — reemplaza el texto genérico en el aviso)"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className={inputCls}
          />
          <GroupPicker
            value={form.notifyChatIds}
            onChange={(v) => setForm({ ...form, notifyChatIds: v })}
            groups={groups}
            frequent={frequentChatIds}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setForm(EMPTY_FORM);
              }}
              className="h-8 text-xs text-text-muted"
            >
              Cancelar
            </Button>
            <Button size="sm" disabled={busy} onClick={handleAdd}
              className="h-8 gap-1.5 bg-accent text-xs text-white hover:bg-accent/90">
              <Check className="h-3.5 w-3.5" /> Guardar
            </Button>
          </div>
        </div>
      )}

      <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-surface-elevated">
              <th className="bg-surface-elevated px-4 py-2.5 text-left text-xs font-medium text-text-muted">Servicio</th>
              <th className="bg-surface-elevated px-4 py-2.5 text-left text-xs font-medium text-text-muted">Nota</th>
              <th className="bg-surface-elevated px-4 py-2.5 text-left text-xs font-medium text-text-muted">Grupos</th>
              <th className="bg-surface-elevated px-4 py-2.5 text-left text-xs font-medium text-text-muted">Estado</th>
              <th className="bg-surface-elevated px-4 py-2.5 text-right text-xs font-medium text-text-muted">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">Cargando…</td>
              </tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                  {q ? "Sin coincidencias" : "No hay servicios marcados todavía"}
                </td>
              </tr>
            )}
            {items.map((item) =>
              editingId === item.id ? (
                <tr key={item.id} className="border-b border-border bg-accent/5 last:border-0">
                  <td className="px-4 py-2" colSpan={5}>
                    <div className="space-y-2">
                      <input
                        value={editForm.serviceRef}
                        disabled
                        className={`${inputCls} opacity-60`}
                        title="El número de Servicio no se puede editar; borra y vuelve a marcar si cambió"
                      />
                      <input
                        value={editForm.note}
                        onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                        className={inputCls}
                        placeholder="Nota (opcional)"
                      />
                      <GroupPicker
                        value={editForm.notifyChatIds}
                        onChange={(v) => setEditForm({ ...editForm, notifyChatIds: v })}
                        groups={groups}
                        frequent={frequentChatIds}
                      />
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleSaveEdit(item.id)}
                          className="h-7 w-7 p-0 text-success hover:bg-success/10">
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}
                          className="h-7 w-7 p-0 text-text-muted hover:bg-surface-elevated">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={item.id} className="border-b border-border transition-colors last:border-0 hover:bg-surface-elevated/40">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-accent">{item.serviceRef}</td>
                  <td className="max-w-[240px] truncate px-4 py-3 text-xs text-text-muted" title={item.note}>
                    {item.note || <span className="italic">texto genérico</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">{item.notifyChatIds.length} grupo(s)</td>
                  <td className="px-4 py-3 text-xs">
                    <button
                      disabled={busy}
                      onClick={() => toggleEnabled(item)}
                      className={`flex items-center gap-1 rounded border px-2 py-0.5 ${
                        item.enabled
                          ? "border-success/40 bg-success-dim text-success"
                          : "border-border text-text-muted"
                      }`}
                    >
                      {item.enabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                      {item.enabled ? "activo" : "desactivado"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(item)}
                        className="h-7 w-7 p-0 text-text-muted hover:bg-surface-elevated hover:text-text-primary">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleDelete(item.id)}
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
