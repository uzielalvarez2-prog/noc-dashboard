"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Siren, Flag, X, CheckCircle2, AlertTriangle, RotateCw } from "lucide-react";

// UP/recuperado si el status contiene resolv/resuelt (mismo criterio que el server).
function isResolvedStatus(status: string | null | undefined): boolean {
  return /resolv|resuelt/i.test(status ?? "");
}

interface WarRoomItem {
  incidentId: string;
  openTime: string;
  status: string;
  company: string;
  serviceId: string;
  state: string;
  district: string;
  assignee: string | null;
  group: string;
  matchedBy: string;
  flagged: boolean;
  resolvedAt: string | null;
  firstSeenAt: string;
  recurrence: number;
}

async function fetchWarRoom(): Promise<{ items: WarRoomItem[] }> {
  const res = await fetch("/api/war-room");
  if (!res.ok) throw new Error("Error al cargar War Room");
  return res.json();
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// IDs ya anunciados en esta sesión (para no repetir el modal).
const SEEN_KEY = "wr-seen-down";
const UP_KEY = "wr-seen-up";
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

export function WarRoomView() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["war-room"],
    queryFn: fetchWarRoom,
    refetchInterval: 60_000,
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  const [alertDown, setAlertDown] = useState<WarRoomItem[]>([]);
  const [alertUp, setAlertUp] = useState<WarRoomItem[]>([]);
  const initialized = useRef(false);

  // Detectar nuevas caídas y recuperaciones desde la última vez.
  useEffect(() => {
    if (!items.length && !initialized.current) return;
    const seenDown = loadSet(SEEN_KEY);
    const seenUp = loadSet(UP_KEY);

    const newDown: WarRoomItem[] = [];
    const newUp: WarRoomItem[] = [];

    for (const it of items) {
      const resolved = Boolean(it.resolvedAt) || isResolvedStatus(it.status);
      if (!resolved && !seenDown.has(it.incidentId)) {
        newDown.push(it);
        seenDown.add(it.incidentId);
      }
      if (resolved && !seenUp.has(it.incidentId)) {
        newUp.push(it);
        seenUp.add(it.incidentId);
      }
    }

    saveSet(SEEN_KEY, seenDown);
    saveSet(UP_KEY, seenUp);

    // En la primera carga de la sesión no disparamos modal (solo sembramos).
    if (initialized.current && (newDown.length || newUp.length)) {
      if (newDown.length) setAlertDown((p) => [...p, ...newDown]);
      if (newUp.length) setAlertUp((p) => [...p, ...newUp]);
    }
    initialized.current = true;
  }, [items]);

  async function toggleFlag(it: WarRoomItem) {
    // Optimista
    qc.setQueryData<{ items: WarRoomItem[] }>(["war-room"], (old) =>
      old
        ? { items: old.items.map((x) => (x.incidentId === it.incidentId ? { ...x, flagged: !x.flagged } : x)) }
        : old
    );
    try {
      await fetch("/api/war-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId: it.incidentId, flagged: !it.flagged }),
      });
    } catch {
      qc.invalidateQueries({ queryKey: ["war-room"] });
    }
  }

  function dismissAlert() {
    setAlertDown([]);
    setAlertUp([]);
  }

  const activos = items.filter((i) => !i.resolvedAt && !isResolvedStatus(i.status));
  const recuperados = items.filter((i) => i.resolvedAt || isResolvedStatus(i.status));
  const showModal = alertDown.length > 0 || alertUp.length > 0;

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-critical/40 bg-critical-dim px-3 py-2">
          <Siren className="h-4 w-4 text-critical" />
          <span className="text-sm text-text-primary">
            <span className="text-lg font-bold text-critical">{activos.length}</span> activos
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span className="text-sm text-text-primary">
            <span className="text-lg font-bold text-success">{recuperados.length}</span> recuperados (7d)
          </span>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["war-room"] })}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:text-text-primary"
        >
          <RotateCw className="h-3.5 w-3.5" /> Actualizar
        </button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              <th className="px-3 py-2.5 text-center text-xs font-medium text-text-muted">🚩</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">Incidente</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">Apertura</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">Estatus</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">Empresa</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">Servicio</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">Estado</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">Asignado</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-text-muted">Distrito</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-text-muted">
                  Cargando War Room...
                </td>
              </tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-text-muted">
                  Sin incidentes de Clientes TOP. Cuando caiga uno que coincida, aparecerá aquí.
                </td>
              </tr>
            )}
            {items.map((it) => {
              const resolved = Boolean(it.resolvedAt) || isResolvedStatus(it.status);
              // Bandera marcada → texto rojo en toda la fila (visual).
              const rowText = it.flagged ? "text-critical" : "text-text-primary";
              return (
                <tr
                  key={it.incidentId}
                  className="border-b border-border transition-colors last:border-0 hover:bg-surface-elevated/40"
                >
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => toggleFlag(it)}
                      title={it.flagged ? "Quitar bandera" : "Marcar bandera"}
                      className={it.flagged ? "text-critical" : "text-text-muted/50 hover:text-text-muted"}
                    >
                      <Flag className={`h-4 w-4 ${it.flagged ? "fill-critical" : ""}`} />
                    </button>
                  </td>
                  <td className={`px-3 py-2.5 font-mono text-xs font-semibold ${rowText}`}>
                    {it.incidentId}
                    {it.recurrence > 1 && (
                      <span
                        title={`${it.recurrence} caídas de este cliente/servicio en 7 días`}
                        className="ml-1.5 rounded bg-warning/15 px-1 text-[10px] font-bold text-warning"
                      >
                        ⟳{it.recurrence}
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2.5 text-xs ${rowText}`}>{fmt(it.openTime)}</td>
                  {/* Estatus: verde si recuperado (solo esta celda) */}
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${
                        resolved
                          ? "border-success/40 bg-success/10 text-success"
                          : it.flagged
                          ? "border-critical/40 bg-critical-dim text-critical"
                          : "border-border bg-surface text-text-muted"
                      }`}
                    >
                      {it.status || "—"}
                    </span>
                  </td>
                  <td className={`px-3 py-2.5 ${rowText}`}>{it.company || "—"}</td>
                  <td className={`px-3 py-2.5 font-mono text-xs ${rowText}`}>{it.serviceId || "—"}</td>
                  <td className={`px-3 py-2.5 text-xs ${rowText}`}>{it.state || "—"}</td>
                  <td className={`px-3 py-2.5 text-xs ${rowText}`}>{it.assignee || "—"}</td>
                  <td className={`px-3 py-2.5 text-xs ${rowText}`}>{it.district || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal de alerta (cierre manual) */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
            {alertDown.length > 0 && (
              <div className="border-b border-border">
                <div className="flex items-center gap-2 bg-critical-dim px-5 py-3">
                  <AlertTriangle className="h-5 w-5 text-critical" />
                  <h3 className="text-base font-bold text-critical">
                    SEVERIDAD CRÍTICA — {alertDown.length} cliente(s) TOP caído(s)
                  </h3>
                </div>
                <ul className="max-h-52 space-y-1.5 overflow-y-auto px-5 py-3">
                  {alertDown.map((it) => (
                    <li key={it.incidentId} className="text-sm text-text-primary">
                      <span className="font-mono text-xs font-bold text-critical">{it.incidentId}</span>{" "}
                      — <span className="font-semibold">{it.company || it.serviceId}</span>
                      {it.serviceId && it.company ? (
                        <span className="text-text-muted"> · {it.serviceId}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {alertUp.length > 0 && (
              <div>
                <div className="flex items-center gap-2 bg-success/10 px-5 py-3">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <h3 className="text-base font-bold text-success">
                    UP — {alertUp.length} cliente(s) recuperado(s)
                  </h3>
                </div>
                <ul className="max-h-52 space-y-1.5 overflow-y-auto px-5 py-3">
                  {alertUp.map((it) => (
                    <li key={it.incidentId} className="text-sm text-text-primary">
                      <span className="font-mono text-xs font-bold text-success">{it.incidentId}</span>{" "}
                      — <span className="font-semibold">{it.company || it.serviceId}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end border-t border-border bg-surface-elevated px-5 py-3">
              <button
                onClick={dismissAlert}
                className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
              >
                <X className="h-4 w-4" /> Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
