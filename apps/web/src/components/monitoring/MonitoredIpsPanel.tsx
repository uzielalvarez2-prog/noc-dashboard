"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Radar, Plus, Pencil, Trash2, Check, X, Search, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MonitoredIp {
  id: string;
  ip: string;
  company: string;
  serviceRef: string;
  siglasIm: string;
  label: string;
  note: string | null;
  notifyEnabled: boolean;
  notifyChatIds: string[];
  createdAt: string;
}

interface WhatsappGroup {
  id: string;
  chatId: string;
  name: string;
}

async function fetchMonitoredIps(): Promise<{ items: MonitoredIp[] }> {
  const res = await fetch("/api/monitored-ips");
  if (!res.ok) throw new Error("Error al cargar IPs monitoreadas");
  return res.json();
}

async function fetchGroups(): Promise<{ groups: WhatsappGroup[] }> {
  const res = await fetch("/api/whatsapp/groups");
  if (!res.ok) throw new Error("Error al cargar grupos");
  return res.json();
}

interface FormState {
  ip: string;
  company: string;
  serviceRef: string;
  siglasIm: string;
  label: string;
  notifyEnabled: boolean;
  notifyChatIds: string[];
}

const EMPTY_FORM: FormState = {
  ip: "",
  company: "",
  serviceRef: "",
  siglasIm: "",
  label: "",
  notifyEnabled: false,
  notifyChatIds: [],
};

export function MonitoredIpsPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["monitored-ips-admin"], queryFn: fetchMonitoredIps });
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
    qc.invalidateQueries({ queryKey: ["monitored-ips-admin"] });
    qc.invalidateQueries({ queryKey: ["monitored-ips-lookup"] });
  }

  async function handleAdd() {
    if (!form.ip.trim() || !form.company.trim()) {
      setError("IP y empresa son requeridos");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/monitored-ips", {
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
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/monitored-ips/${id}`, {
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

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/monitored-ips/${id}`, { method: "DELETE" });
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

  function startEdit(item: MonitoredIp) {
    setEditingId(item.id);
    setEditForm({
      ip: item.ip,
      company: item.company,
      serviceRef: item.serviceRef,
      siglasIm: item.siglasIm,
      label: item.label,
      notifyEnabled: item.notifyEnabled,
      notifyChatIds: item.notifyChatIds,
    });
  }

  function toggleChatId(list: string[], chatId: string): string[] {
    return list.includes(chatId) ? list.filter((c) => c !== chatId) : [...list, chatId];
  }

  const all = data?.items ?? [];
  const q = filter.trim().toLowerCase();
  const items = q
    ? all.filter(
        (c) =>
          c.ip.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q) ||
          c.siglasIm.toLowerCase().includes(q) ||
          c.label.toLowerCase().includes(q),
      )
    : all;

  const inputCls =
    "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none";

  function GroupPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
    if (groups.length === 0) {
      return <span className="text-xs text-text-muted">Sin grupos detectados</span>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {groups.map((g) => {
          const active = value.includes(g.chatId);
          return (
            <button
              key={g.chatId}
              type="button"
              onClick={() => onChange(toggleChatId(value, g.chatId))}
              className={`rounded border px-1.5 py-0.5 text-[10px] ${
                active ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-text-muted"
              }`}
            >
              {g.name || g.chatId}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-text-muted" />
          <h2 className="text-base font-semibold text-text-primary">Base de IPs monitoreadas</h2>
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
              placeholder="Buscar (IP, empresa, siglas)..."
              className="rounded-md border border-border bg-surface py-1.5 pl-7 pr-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
            />
          </div>
          <Button
            size="sm"
            onClick={() => setAdding(true)}
            className="h-8 gap-1.5 bg-accent text-xs text-white hover:bg-accent/90"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-critical/40 bg-critical-dim px-3 py-2 text-xs text-critical">
          {error}
        </p>
      )}

      {adding && (
        <div className="space-y-3 rounded-lg border border-border bg-accent/5 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input autoFocus placeholder="IP pública" value={form.ip}
              onChange={(e) => setForm({ ...form, ip: e.target.value })} className={inputCls} />
            <input placeholder="Empresa" value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })} className={inputCls} />
            <input placeholder="Servicio (opcional)" value={form.serviceRef}
              onChange={(e) => setForm({ ...form, serviceRef: e.target.value })} className={inputCls} />
            <input placeholder="Siglas IM (opcional)" value={form.siglasIm}
              onChange={(e) => setForm({ ...form, siglasIm: e.target.value })} className={inputCls} />
          </div>
          <input placeholder="Etiqueta (ej. Enlace principal MTY)" value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })} className={inputCls} />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="notify-new"
              checked={form.notifyEnabled}
              onChange={(e) => setForm({ ...form, notifyEnabled: e.target.checked })}
              className="h-3.5 w-3.5 accent-accent"
            />
            <label htmlFor="notify-new" className="text-xs text-text-muted">Notificar por WhatsApp al recuperarse</label>
          </div>
          {form.notifyEnabled && (
            <GroupPicker value={form.notifyChatIds} onChange={(v) => setForm({ ...form, notifyChatIds: v })} />
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setForm(EMPTY_FORM); }}
              className="h-8 text-xs text-text-muted">Cancelar</Button>
            <Button size="sm" disabled={busy} onClick={handleAdd}
              className="h-8 gap-1.5 bg-accent text-xs text-white hover:bg-accent/90">
              <Check className="h-3.5 w-3.5" /> Guardar
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">IP</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">Empresa</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">Etiqueta</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">Notificación</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-text-muted">Acciones</th>
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
                  {q ? "Sin coincidencias" : "No hay IPs capturadas todavía"}
                </td>
              </tr>
            )}
            {items.map((item) =>
              editingId === item.id ? (
                <tr key={item.id} className="border-b border-border bg-accent/5 last:border-0">
                  <td className="px-4 py-2" colSpan={5}>
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <input value={editForm.ip} onChange={(e) => setEditForm({ ...editForm, ip: e.target.value })} className={inputCls} placeholder="IP" />
                        <input value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} className={inputCls} placeholder="Empresa" />
                        <input value={editForm.serviceRef} onChange={(e) => setEditForm({ ...editForm, serviceRef: e.target.value })} className={inputCls} placeholder="Servicio" />
                        <input value={editForm.siglasIm} onChange={(e) => setEditForm({ ...editForm, siglasIm: e.target.value })} className={inputCls} placeholder="Siglas IM" />
                      </div>
                      <input value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} className={inputCls} placeholder="Etiqueta" />
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editForm.notifyEnabled}
                          onChange={(e) => setEditForm({ ...editForm, notifyEnabled: e.target.checked })}
                          className="h-3.5 w-3.5 accent-accent"
                        />
                        <span className="text-xs text-text-muted">Notificar por WhatsApp</span>
                      </div>
                      {editForm.notifyEnabled && (
                        <GroupPicker
                          value={editForm.notifyChatIds}
                          onChange={(v) => setEditForm({ ...editForm, notifyChatIds: v })}
                        />
                      )}
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
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-accent">{item.ip}</td>
                  <td className="px-4 py-3 font-medium text-text-primary">{item.company}</td>
                  <td className="px-4 py-3 text-xs text-text-muted">{item.label || "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {item.notifyEnabled ? (
                      <span className="flex items-center gap-1 text-success"><Bell className="h-3.5 w-3.5" /> {item.notifyChatIds.length} grupo(s)</span>
                    ) : (
                      <span className="flex items-center gap-1 text-text-muted"><BellOff className="h-3.5 w-3.5" /> Desactivada</span>
                    )}
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
