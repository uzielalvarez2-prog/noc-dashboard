"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Loader2, CheckCircle2, AlertCircle, Trash2, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Group {
  id: string;
  chatId: string;
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
    refetchInterval: 30_000, // refresca por si aparece un grupo recién descubierto
  });
  const groups = data?.groups ?? [];

  const [chatId, setChatId] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);

  // Pre-selecciona el primer grupo cuando cargan.
  useEffect(() => {
    if (!chatId && groups.length > 0) setChatId(groups[0].chatId);
  }, [groups, chatId]);

  async function send() {
    if (!chatId) {
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
        body: JSON.stringify({ chatId, text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ ok: false, msg: body.error ?? "No se pudo enviar" });
        return;
      }
      const name = groups.find((g) => g.chatId === chatId)?.name ?? "el grupo";
      setFeedback({ ok: true, msg: `Enviado a ${name}` });
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
              Aún no se detecta ningún grupo. Los grupos aparecen solos cuando llega
              un mensaje a ellos por el WhatsApp de la empresa. Manda algo a un grupo
              y recarga en unos segundos.
            </p>
          ) : (
            <select
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              className={inputCls}
            >
              {groups.map((g) => (
                <option key={g.chatId} value={g.chatId}>
                  {g.name || g.chatId}
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
// Administración de grupos (solo SUPERVISOR/ADMIN). Los grupos se AUTO-DESCUBREN;
// aquí solo se habilitan/deshabilitan (para el selector) o se quitan. Lista TODOS
// los grupos (?all=1).
// ─────────────────────────────────────────────────────────────────────────────
function GroupsAdmin({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-groups", "all"],
    queryFn: () => fetchGroups(true),
  });
  const groups = data?.groups ?? [];
  const [busy, setBusy] = useState(false);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["whatsapp-groups"] });
    onChanged();
  }

  async function toggle(g: Group) {
    setBusy(true);
    try {
      await fetch("/api/whatsapp/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: g.id, enabled: !g.enabled }),
      });
      refresh();
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

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">Grupos detectados</h2>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-xs text-text-muted">
        Los grupos aparecen solos cuando llega un mensaje a ellos. Deshabilita los
        que no quieras ver en el selector de envío.
      </p>

      {isLoading ? (
        <p className="text-sm text-text-muted">Cargando…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-text-muted">Aún no se detecta ningún grupo.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-text-primary">{g.name || g.chatId}</p>
                <p className="truncate font-mono text-[10px] text-text-muted">{g.chatId}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  disabled={busy}
                  onClick={() => toggle(g)}
                  className={`rounded border px-2 py-0.5 text-[10px] ${
                    g.enabled
                      ? "border-success/40 bg-success-dim text-success"
                      : "border-border text-text-muted"
                  }`}
                >
                  {g.enabled ? "habilitado" : "deshabilitado"}
                </button>
                <button
                  disabled={busy}
                  onClick={() => remove(g.id)}
                  title="Quitar"
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
