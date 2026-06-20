"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

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
            className={`group relative pointer-events-auto overflow-hidden rounded-2xl border bg-surface/50 shadow-[0_8px_32px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-150 transition-transform duration-200 hover:-translate-y-0.5 ${
              down ? "border-critical/40" : "border-success/40"
            }`}
          >
            {/* Brillo superior tenue (borde de cristal) */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

            <div
              className={`flex items-center gap-2 border-b border-white/10 px-3.5 py-2.5 ${
                down ? "bg-critical/15" : "bg-success/15"
              }`}
            >
              {down ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-critical drop-shadow" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success drop-shadow" />
              )}
              <span
                className={`text-sm font-bold tracking-wide ${down ? "text-critical" : "text-success"}`}
              >
                {down ? "ENLACE CAÍDO — DOWN" : "ENLACE RECUPERADO — UP"}
              </span>
              <button
                onClick={() => dismiss(t.key)}
                title="Cerrar"
                className="ml-auto rounded-full p-0.5 text-text-muted transition-colors hover:bg-white/10 hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 px-3.5 py-3">
              <div className="min-w-0">
                <p className="font-mono text-xs font-bold text-text-primary">
                  {t.incidentId}
                </p>
                <p className="truncate text-sm font-medium text-text-primary">
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
                className="flex shrink-0 items-center gap-1 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-semibold text-text-primary shadow-sm backdrop-blur transition-all hover:scale-105 hover:bg-white/20 active:scale-95"
              >
                👍 Ok
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
