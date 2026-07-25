"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Loader2, CheckCircle2, AlertCircle, Plus, Trash2, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Group {
  id: string;
  name: string;
  enabled: boolean;
  note: string | null;
}

async function fetchGroups(all: boolean): Promise<{ groups: Group[] }> {
  const res = await fetch(`/api/whatsapp/groups${all ? "?all=1" : ""}`);
  if (!res.ok) throw new Error("Error al cargar grupos");
  return res.json();
}

export function WhatsappSendPanel() {
  const qc = useQueryClient();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsAdmin(d.role === "ADMIN" || d.role === "SUPERVISOR"))
      .catch(() => {});
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-groups"],
    queryFn: () => fetchGroups(false),
  });
  const groups = data?.groups ?? [];

  const [groupName, setGroupName] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);

  // Pre-selecciona el primer grupo cuando cargan.
  useEffect(() => {
    if (!groupName && groups.length > 0) setGroupName(groups[0].name);
  }, [groups, groupName]);

  async function send() {
    if (!groupName) {
      setFeedback({ ok: false, msg: "Selecciona un grupo" });
      return;
    }
    if (!text.trim()) {
      setFeedback({ ok: false, msg: "El mensaje está vacío" });
      return;
    }
    setSending(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupName, text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ ok: false, msg: body.error ?? "No se pudo enviar" });
        return;
      }
      setFeedback({ ok: true, msg: `Enviado a ${groupName}` });
      setText("");
    } catch {
      setFeedback({ ok: false, msg: "Error de conexión" });
    } finally {
      setSending(false);
    }
  }

  const inputCls =
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none";

  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
        {/* Grupo */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Grupo destino</label>
          {isLoading ? (
            <p className="text-sm text-text-muted">Cargando grupos…</p>
          ) : groups.length === 0 ? (
            <p className="rounded-md border border-warning/40 bg-warning-dim px-3 py-2 text-xs text-warning">
              No hay grupos configurados.
              {isAdmin ? " Usa “Administrar grupos” para agregar el primero." : " Pide a un supervisor que agregue uno."}
            </p>
          ) : (
            <select
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className={inputCls}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Mensaje */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Mensaje</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            maxLength={4000}
            placeholder="Escribe el mensaje que se enviará al grupo…"
            className={`${inputCls} resize-y font-mono`}
          />
          <div className="mt-1 text-right text-xs text-text-muted/70">{text.length}/4000</div>
        </div>

        {/* Feedback */}
        {feedback && (
          <div
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              feedback.ok
                ? "border border-success/40 bg-success-dim text-success"
                : "border border-critical/40 bg-critical-dim text-critical"
            }`}
          >
            {feedback.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {feedback.msg}
          </div>
        )}

        {/* Acciones */}
        <div className="flex items-center justify-between">
          {isAdmin ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAdminOpen((v) => !v)}
              className="gap-1.5 text-xs text-text-muted"
            >
              <Settings2 className="h-3.5 w-3.5" /> Administrar grupos
            </Button>
          ) : (
            <span />
          )}
          <Button
            onClick={send}
            disabled={sending || groups.length === 0}
            className="gap-1.5 bg-accent text-white hover:bg-accent/90"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </Button>
        </div>
      </div>

      {isAdmin && adminOpen && (
        <GroupsAdmin
          onClose={() => setAdminOpen(false)}
          onChanged={() => qc.invalidateQueries({ queryKey: ["whatsapp-groups"] })}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Administración de la whitelist de grupos (solo SUPERVISOR/ADMIN). Lista TODOS
// los grupos (?all=1), permite agregar por nombre exacto y quitar.
// ─────────────────────────────────────────────────────────────────────────────
function GroupsAdmin({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-groups", "all"],
    queryFn: () => fetchGroups(true),
  });
  const groups = data?.groups ?? [];

  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["whatsapp-groups"] });
    onChanged();
  }

  async function add() {
    if (!name.trim()) {
      setError("El nombre del grupo es requerido");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), note: note.trim() }),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Error al agregar");
        return;
      }
      setName("");
      setNote("");
      refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/whatsapp/groups?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none";

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">Grupos permitidos</h2>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-xs text-text-muted">
        El nombre debe coincidir EXACTO con el del grupo en WhatsApp (acentos y mayúsculas).
      </p>

      {/* Alta */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre exacto del grupo"
          className={inputCls}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nota (opcional)"
          className={inputCls}
        />
        <Button onClick={add} disabled={busy} className="shrink-0 gap-1.5 bg-accent text-white hover:bg-accent/90">
          <Plus className="h-4 w-4" /> Agregar
        </Button>
      </div>
      {error && <p className="text-xs text-critical">{error}</p>}

      {/* Lista */}
      {isLoading ? (
        <p className="text-sm text-text-muted">Cargando…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-text-muted">Sin grupos aún.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center justify-between py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-text-primary">{g.name}</p>
                {g.note && <p className="truncate text-xs text-text-muted">{g.note}</p>}
              </div>
              <div className="flex items-center gap-2">
                {!g.enabled && (
                  <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-muted">
                    deshabilitado
                  </span>
                )}
                <button
                  disabled={busy}
                  onClick={() => remove(g.id)}
                  className="rounded p-1 text-text-muted hover:bg-critical-dim hover:text-critical"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
