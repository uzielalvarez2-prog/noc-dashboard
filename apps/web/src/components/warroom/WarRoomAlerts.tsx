"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Check, X } from "lucide-react";

// UP/recuperado si el status contiene resolv/resuelt (mismo criterio que el server).
function isResolvedStatus(status: string | null | undefined): boolean {
  return /resolv|resuelt/i.test(status ?? "");
}

interface WarRoomItem {
  incidentId: string;
  status: string;
  company: string;
  serviceId: string;
  resolvedAt: string | null;
}

async function fetchWarRoom(): Promise<{ items: WarRoomItem[] }> {
  const res = await fetch("/api/war-room");
  if (!res.ok) throw new Error("Error al cargar War Room");
  return res.json();
}

// Avisos ya mostrados en esta sesión (para no repetir el toast en cada poll/página).
const SEEN_DOWN = "wr-seen-down";
const SEEN_UP = "wr-seen-up";
function loadSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(key) ?? "[]"));
  } catch {
    return new Set();
  }
}
function saveSet(key: string, set: Set<string>) {
  sessionStorage.setItem(key, JSON.stringify([...set]));
}

interface Toast {
  key: string;
  type: "down" | "up";
  incidentId: string;
  company: string;
  serviceId: string;
}

// Notificaciones globales de War Room. Se monta una sola vez en el layout del
// dashboard, así los avisos de "enlace caído" (DOWN) y "enlace recuperado" (UP)
// aparecen en CUALQUIER página, en cascada arriba a la derecha.
export function WarRoomAlerts() {
  const { data } = useQuery({
    queryKey: ["war-room"],
    queryFn: fetchWarRoom,
    refetchInterval: 60_000,
  });

  const [toasts, setToasts] = useState<Toast[]>([]);
  const initialized = useRef(false);

  useEffect(() => {
    const items = data?.items;
    if (!items) return;

    const seenDown = loadSet(SEEN_DOWN);
    const seenUp = loadSet(SEEN_UP);
    const fresh: Toast[] = [];

    for (const it of items) {
      const resolved = Boolean(it.resolvedAt) || isResolvedStatus(it.status);
      if (!resolved && !seenDown.has(it.incidentId)) {
        seenDown.add(it.incidentId);
        fresh.push({
          key: `down-${it.incidentId}`,
          type: "down",
          incidentId: it.incidentId,
          company: it.company,
          serviceId: it.serviceId,
        });
      }
      if (resolved && !seenUp.has(it.incidentId)) {
        seenUp.add(it.incidentId);
        fresh.push({
          key: `up-${it.incidentId}`,
          type: "up",
          incidentId: it.incidentId,
          company: it.company,
          serviceId: it.serviceId,
        });
      }
    }

    saveSet(SEEN_DOWN, seenDown);
    saveSet(SEEN_UP, seenUp);

    // En la primera carga de la sesión solo sembramos; no inundamos con toasts.
    if (initialized.current && fresh.length) {
      setToasts((prev) => [...fresh, ...prev]);
    }
    initialized.current = true;
  }, [data]);

  function dismiss(key: string) {
    setToasts((prev) => prev.filter((t) => t.key !== key));
  }

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => {
        const down = t.type === "down";
        return (
          <div
            key={t.key}
            className={`pointer-events-auto overflow-hidden rounded-lg border bg-surface shadow-2xl ${
              down ? "border-critical/50" : "border-success/50"
            }`}
          >
            <div
              className={`flex items-center gap-2 px-3 py-2 ${
                down ? "bg-critical-dim" : "bg-success/10"
              }`}
            >
              {down ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-critical" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              )}
              <span
                className={`text-sm font-bold ${down ? "text-critical" : "text-success"}`}
              >
                {down ? "ENLACE CAÍDO — DOWN" : "ENLACE RECUPERADO — UP"}
              </span>
              <button
                onClick={() => dismiss(t.key)}
                title="Cerrar"
                className="ml-auto text-text-muted transition-colors hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="font-mono text-xs font-bold text-text-primary">
                  {t.incidentId}
                </p>
                <p className="truncate text-sm text-text-primary">
                  {t.company || t.serviceId || "—"}
                </p>
                {t.company && t.serviceId && (
                  <p className="truncate font-mono text-xs text-text-muted">
                    {t.serviceId}
                  </p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.key)}
                title="Confirmar leído"
                className="flex shrink-0 items-center gap-1 rounded-md border border-success/40 bg-success/10 px-2.5 py-1.5 text-xs font-semibold text-success transition-colors hover:bg-success/20"
              >
                <Check className="h-3.5 w-3.5" /> Visto
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
