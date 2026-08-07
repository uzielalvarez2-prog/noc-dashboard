"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AgentContact {
  id: string;
  hpsmName: string;
  displayName: string;
  phone: string;
  enabled: boolean;
}

async function fetchContacts(): Promise<{ contacts: AgentContact[] }> {
  const res = await fetch("/api/agent-contacts");
  if (!res.ok) throw new Error("Error al cargar contactos");
  return res.json();
}

export function AgentContactsPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["agent-contacts"], queryFn: fetchContacts });

  const [hpsmName, setHpsmName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["agent-contacts"] });
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/agent-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hpsmName, displayName, phone }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Error al guardar");
        return;
      }
      setHpsmName("");
      setDisplayName("");
      setPhone("");
      refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(c: AgentContact) {
    await fetch("/api/agent-contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, enabled: !c.enabled }),
    });
    refresh();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/agent-contacts?id=${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AtSign className="h-4 w-4 text-text-muted" />
        <h2 className="text-base font-semibold text-text-primary">
          Contactos para @mención
        </h2>
      </div>
      <p className="text-sm text-text-muted">
        El nombre de HPSM debe coincidir con la columna &quot;Asignado&quot; del incidente
        (ej. <span className="font-mono text-xs">gpaniagu</span>). Si el asignado no está
        aquí, la alerta se manda igual pero sin mención.
      </p>

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-text-muted">Nombre HPSM</label>
          <input
            value={hpsmName}
            onChange={(e) => setHpsmName(e.target.value)}
            placeholder="gpaniagu"
            className="w-full rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-sm text-text-primary"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-text-muted">
            Nombre visible
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Gustavo Paniagua"
            className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-text-muted">
            WhatsApp (con país)
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="5215512345678"
            className="w-full rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-sm text-text-primary"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={saving}
          className="h-8 gap-1.5 bg-accent text-xs text-white hover:bg-accent/90"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar
        </Button>
      </form>

      {error && (
        <p className="rounded-md border border-critical/40 bg-critical-dim px-3 py-2 text-xs text-critical">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">
                Nombre HPSM
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">
                Nombre visible
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">
                WhatsApp
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">Estado</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-text-muted">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                  Cargando contactos...
                </td>
              </tr>
            )}
            {!isLoading && data?.contacts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                  Aún no hay contactos capturados
                </td>
              </tr>
            )}
            {data?.contacts.map((c) => (
              <tr
                key={c.id}
                className="border-b border-border transition-colors last:border-0 hover:bg-surface-elevated/40"
              >
                <td className="px-4 py-3 font-mono text-xs text-text-primary">{c.hpsmName}</td>
                <td className="px-4 py-3 text-text-primary">{c.displayName || "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-text-muted">{c.phone}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleEnabled(c)}
                    className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium transition-colors ${
                      c.enabled
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-border bg-surface text-text-muted"
                    }`}
                  >
                    {c.enabled ? "Activo" : "Inactivo"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(c.id)}
                    className="h-7 w-7 p-0 text-text-muted hover:bg-critical-dim hover:text-critical"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
