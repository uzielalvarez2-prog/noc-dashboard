"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Radar, Pencil, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MonitoredIpMatch {
  id: string;
  ip: string;
  company: string;
  serviceRef: string;
  siglasIm: string;
  notifyEnabled: boolean;
  notifyChatIds: string[];
}

export interface ActiveIpMonitor {
  id: string;
  incidentId: string;
  lastUp: boolean;
  upSince: string | null;
  alertedAt: string | null;
}

interface Props {
  incidentId: string;
  company: string;
  serviceId: string;
  match: MonitoredIpMatch | undefined;
  monitor: ActiveIpMonitor | undefined;
}

async function saveIp(
  existingId: string | undefined,
  body: {
    ip: string;
    company: string;
    serviceRef?: string;
  },
): Promise<MonitoredIpMatch> {
  const res = await fetch(existingId ? `/api/monitored-ips/${existingId}` : "/api/monitored-ips", {
    method: existingId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "No se pudo guardar la IP");
  return data.monitoredIp;
}

async function activateMonitor(body: {
  incidentId: string;
  ip: string;
  company: string;
  serviceRef?: string;
}): Promise<void> {
  const res = await fetch("/api/monitored-ips/monitors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo activar el monitoreo");
}

async function deactivateMonitor(id: string): Promise<void> {
  await fetch(`/api/monitored-ips/monitors/${id}`, { method: "DELETE" });
}

/**
 * Celda "IP / Monitoreo" para la tabla de Incidentes Abiertos. Muestra la IP
 * conocida (editable inline, mismo patrón que NoteCell de WarRoomView) y el
 * botón/badge de monitoreo. ADMIN-only — el padre ya filtra por rol.
 */
export function IpMonitorCell({ incidentId, company, serviceId, match, monitor }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(match?.ip ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["monitored-ips-lookup"] });
    qc.invalidateQueries({ queryKey: ["ip-monitors"] });
  }

  async function handleSaveIp() {
    const ip = draft.trim();
    if (!ip) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveIp(match?.id, { ip, company, serviceRef: serviceId });
      invalidate();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  }

  async function handleActivate() {
    if (!match?.ip) return;
    setBusy(true);
    setError(null);
    try {
      await activateMonitor({ incidentId, ip: match.ip, company, serviceRef: serviceId });
      invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al activar");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    if (!monitor) return;
    setBusy(true);
    try {
      await deactivateMonitor(monitor.id);
      invalidate();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSaveIp();
            if (e.key === "Escape") {
              setDraft(match?.ip ?? "");
              setEditing(false);
            }
          }}
          placeholder="IP pública..."
          className="w-28 rounded border border-border bg-surface px-1.5 py-1 font-mono text-xs text-text-primary focus:border-accent focus:outline-none"
        />
        <button onClick={() => void handleSaveIp()} title="Guardar" className="text-success hover:opacity-80">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => {
            setDraft(match?.ip ?? "");
            setEditing(false);
          }}
          title="Cancelar"
          className="text-text-muted hover:text-text-primary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => {
          setDraft(match?.ip ?? "");
          setEditing(true);
        }}
        title="Editar IP"
        className="group flex items-center gap-1 font-mono text-xs text-text-muted hover:text-text-primary"
      >
        <span>{match?.ip || "—"}</span>
        <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
      </button>

      {match?.ip && !monitor && (
        <button
          onClick={() => void handleActivate()}
          disabled={busy}
          title="Activar monitoreo: alerta por WhatsApp cuando el enlace responda sostenido"
          className="flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Radar className="h-3 w-3" />}
          Monitorear
        </button>
      )}

      {monitor && (
        <button
          onClick={() => void handleDeactivate()}
          disabled={busy}
          title={monitor.alertedAt ? "Ya se notificó — click para desactivar" : "Esperando confirmación sostenida — click para desactivar"}
          className={cn(
            "flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium disabled:opacity-50",
            monitor.alertedAt
              ? "border-success/40 bg-success-dim text-success"
              : "border-warning/40 bg-warning-dim text-warning",
          )}
        >
          <Radar className="h-3 w-3" />
          {monitor.alertedAt ? "notificado" : "esperando…"}
        </button>
      )}

      {error && <span className="text-[10px] text-critical">{error}</span>}
    </div>
  );
}
