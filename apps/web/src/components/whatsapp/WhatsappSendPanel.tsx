"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Settings2,
  X,
  Search,
  ChevronDown,
  CalendarClock,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GroupPicker } from "@/components/monitoring/GroupPicker";
import { canAccessMonitoring } from "@/lib/permissions";

/** Normaliza para buscar sin acentos ni mayúsculas: "supervisión" encuentra "SUPERVISION". */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

interface Group {
  id: string;
  chatId: string;
  name: string;
  enabled: boolean;
  note: string | null;
  isClientGroup: boolean;
}

async function fetchGroups(all: boolean): Promise<{ groups: Group[] }> {
  const res = await fetch(`/api/whatsapp/groups${all ? "?all=1" : ""}`);
  if (!res.ok) throw new Error("Error al cargar grupos");
  return res.json();
}

export function WhatsappSendPanel() {
  const qc = useQueryClient();
  const [isAdmin, setIsAdmin] = useState(false);
  // Programar recordatorios es ADMIN estricto (Supervisor no).
  const [canSchedule, setCanSchedule] = useState(false);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setIsAdmin(d.role === "ADMIN" || d.role === "SUPERVISOR");
        setCanSchedule(canAccessMonitoring(d.role));
      })
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

  // Modo "Programar": permite elegir varios grupos y una fecha/hora futura en
  // vez de mandar de inmediato a un solo grupo.
  const [scheduling, setScheduling] = useState(false);
  const [scheduleChatIds, setScheduleChatIds] = useState<string[]>([]);
  const [scheduleAt, setScheduleAt] = useState("");

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

  async function schedule() {
    if (scheduleChatIds.length === 0) {
      setFeedback({ ok: false, msg: "Elige al menos un grupo" });
      return;
    }
    if (!text.trim()) {
      setFeedback({ ok: false, msg: "El mensaje está vacío" });
      return;
    }
    if (!scheduleAt) {
      setFeedback({ ok: false, msg: "Elige fecha y hora" });
      return;
    }
    setSending(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/scheduled-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          notifyChatIds: scheduleChatIds,
          sendAt: new Date(scheduleAt).toISOString(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ ok: false, msg: body.error ?? "No se pudo programar" });
        return;
      }
      setFeedback({ ok: true, msg: "Recordatorio programado" });
      setText("");
      setScheduleChatIds([]);
      setScheduleAt("");
      qc.invalidateQueries({ queryKey: ["scheduled-whatsapp"] });
    } catch {
      setFeedback({ ok: false, msg: "Error de conexión" });
    } finally {
      setSending(false);
    }
  }

  // Mínimo seleccionable: ahora + 1 min, en horario local del navegador, en el
  // formato que exige <input type="datetime-local"> (sin segundos ni zona).
  const minDateTimeLocal = useMemo(() => {
    const d = new Date(Date.now() + 60_000);
    d.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  const inputCls =
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none";

  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
        {/* Toggle envío inmediato / programado */}
        {canSchedule && (
        <div className="flex gap-1.5 rounded-md border border-border bg-surface-elevated p-1">
          <button
            type="button"
            onClick={() => setScheduling(false)}
            className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              !scheduling ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
            }`}
          >
            Enviar ahora
          </button>
          <button
            type="button"
            onClick={() => setScheduling(true)}
            className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              scheduling ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" /> Programar
            </span>
          </button>
        </div>
        )}

        {/* Grupo */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">
            {scheduling ? "Grupo(s) destino" : "Grupo destino"}
          </label>
          {isLoading ? (
            <p className="text-sm text-text-muted">Cargando grupos…</p>
          ) : groups.length === 0 ? (
            <p className="rounded-md border border-warning/40 bg-warning-dim px-3 py-2 text-xs text-warning">
              Aún no se detecta ningún grupo. Los grupos aparecen solos cuando llega
              un mensaje a ellos por el WhatsApp de la empresa. Manda algo a un grupo
              y recarga en unos segundos.
            </p>
          ) : scheduling ? (
            <GroupPicker value={scheduleChatIds} onChange={setScheduleChatIds} groups={groups} />
          ) : (
            <GroupCombobox groups={groups} value={chatId} onChange={setChatId} />
          )}
        </div>

        {/* Fecha/hora (solo modo programado) */}
        {scheduling && (
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">Enviar el</label>
            <input
              type="datetime-local"
              value={scheduleAt}
              min={minDateTimeLocal}
              onChange={(e) => setScheduleAt(e.target.value)}
              className={inputCls}
            />
          </div>
        )}

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
          {scheduling ? (
            <Button
              onClick={schedule}
              disabled={sending || groups.length === 0}
              className="gap-1.5 bg-accent text-white hover:bg-accent/90"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
              Programar
            </Button>
          ) : (
            <Button
              onClick={send}
              disabled={sending || groups.length === 0}
              className="gap-1.5 bg-accent text-white hover:bg-accent/90"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar
            </Button>
          )}
        </div>
      </div>

      {isAdmin && adminOpen && (
        <GroupsAdmin
          onClose={() => setAdminOpen(false)}
          onChanged={() => qc.invalidateQueries({ queryKey: ["whatsapp-groups"] })}
        />
      )}

      {canSchedule && <ScheduledWhatsappList groups={groups} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lista de recordatorios programados: pendientes primero (con botón cancelar),
// luego los ya procesados (enviado/error/cancelado) como historial reciente.
// ─────────────────────────────────────────────────────────────────────────────
interface ScheduledItem {
  id: string;
  text: string;
  notifyChatIds: string[];
  sendAt: string;
  sentAt: string | null;
  ok: boolean;
  error: string | null;
  cancelledAt: string | null;
  createdByName: string;
}

async function fetchScheduled(): Promise<{ items: ScheduledItem[] }> {
  const res = await fetch("/api/scheduled-whatsapp");
  if (!res.ok) throw new Error("Error al cargar recordatorios");
  return res.json();
}

function groupNames(chatIds: string[], groups: Group[]): string {
  if (chatIds.length === 0) return "—";
  return chatIds.map((id) => groups.find((g) => g.chatId === id)?.name ?? id).join(", ");
}

function ScheduledWhatsappList({ groups }: { groups: Group[] }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["scheduled-whatsapp"],
    queryFn: fetchScheduled,
    refetchInterval: 30_000,
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const items = data?.items ?? [];

  async function cancel(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/scheduled-whatsapp/${id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["scheduled-whatsapp"] });
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading || items.length === 0) return null;

  const pending = items.filter((i) => !i.sentAt && !i.cancelledAt);
  const done = items.filter((i) => i.sentAt || i.cancelledAt).slice(0, 20);

  function StatusBadge({ item }: { item: ScheduledItem }) {
    if (item.cancelledAt) {
      return (
        <span className="flex items-center gap-1 text-text-muted">
          <Ban className="h-3.5 w-3.5" /> cancelado
        </span>
      );
    }
    if (item.sentAt) {
      return item.ok ? (
        <span className="flex items-center gap-1 text-success">
          <CheckCircle2 className="h-3.5 w-3.5" /> enviado
        </span>
      ) : (
        <span className="flex items-center gap-1 text-critical" title={item.error ?? undefined}>
          <AlertCircle className="h-3.5 w-3.5" /> falló
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-accent">
        <CalendarClock className="h-3.5 w-3.5" /> pendiente
      </span>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-text-primary">Recordatorios programados</h2>
      <ul className="divide-y divide-border/60">
        {[...pending, ...done].map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-text-primary" title={item.text}>
                {item.text}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                {new Date(item.sendAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                {groupNames(item.notifyChatIds, groups)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs">
              <StatusBadge item={item} />
              {!item.sentAt && !item.cancelledAt && (
                <button
                  disabled={busyId === item.id}
                  onClick={() => cancel(item.id)}
                  title="Cancelar"
                  className="rounded p-1 text-text-muted hover:bg-critical-dim hover:text-critical"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Selector de grupo con buscador. Antes era un <select> plano con ~90
// opciones — el usuario tenía que usar Ctrl+F del navegador para encontrar un
// grupo. Ahora un input filtra la lista en vivo (por nombre, sin acentos).
// ─────────────────────────────────────────────────────────────────────────────
function GroupCombobox({
  groups,
  value,
  onChange,
}: {
  groups: Group[];
  value: string;
  onChange: (chatId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = groups.find((g) => g.chatId === value);

  const results = useMemo(() => {
    const q = norm(query.trim());
    const sorted = [...groups].sort((a, b) => (a.name || a.chatId).localeCompare(b.name || b.chatId, "es"));
    if (!q) return sorted;
    return sorted.filter((g) => norm(g.name || g.chatId).includes(q));
  }, [groups, query]);

  function pick(chatId: string) {
    onChange(chatId);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-left text-sm text-text-primary focus:border-accent focus:outline-none"
      >
        <span className="truncate">{selected?.name || selected?.chatId || "Selecciona un grupo…"}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
      </button>

      {open && (
        <>
          {/* Overlay para cerrar al hacer clic fuera. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-lg">
            <div className="relative border-b border-border">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar grupo…"
                className="w-full bg-transparent py-2 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {results.length === 0 ? (
                <p className="px-3 py-3 text-sm text-text-muted">Sin coincidencias para "{query}"</p>
              ) : (
                results.map((g) => (
                  <button
                    key={g.chatId}
                    type="button"
                    onClick={() => pick(g.chatId)}
                    className={`block w-full truncate px-3 py-2 text-left text-sm transition-colors ${
                      g.chatId === value
                        ? "bg-accent/10 text-accent"
                        : "text-text-primary hover:bg-surface-elevated"
                    }`}
                  >
                    {g.name || g.chatId}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
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

  async function toggleClientGroup(g: Group) {
    setBusy(true);
    try {
      await fetch("/api/whatsapp/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: g.id, isClientGroup: !g.isClientGroup }),
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
                  onClick={() => toggleClientGroup(g)}
                  title="Grupos de cliente reciben el formato Incidente/Sitio/Referencia en la alerta de servicio activo"
                  className={`rounded border px-2 py-0.5 text-[10px] ${
                    g.isClientGroup
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-border text-text-muted"
                  }`}
                >
                  {g.isClientGroup ? "grupo de cliente" : "grupo interno"}
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
