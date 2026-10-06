"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, PlayCircle, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type WhatsappGroup } from "./GroupPicker";

async function fetchSuspendidos(): Promise<{ groups: WhatsappGroup[] }> {
  const res = await fetch("/api/whatsapp/groups/suspendidos");
  if (!res.ok) throw new Error("Error al cargar grupos suspendidos");
  return res.json();
}

async function fetchGroups(): Promise<{ groups: WhatsappGroup[] }> {
  const res = await fetch("/api/whatsapp/groups");
  if (!res.ok) throw new Error("Error al cargar grupos");
  return res.json();
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Grupos de WhatsApp suspendidos: no reciben NINGÚN aviso automático (apertura,
 * ACTIVO de monitoreo IP, posible baja, programados) aunque sigan configurados
 * como destino. Lo que llega mientras tanto no se reenvía al reactivar.
 */
export function GruposSuspendidosPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["wa-suspendidos"], queryFn: fetchSuspendidos });
  const { data: groupsData } = useQuery({ queryKey: ["whatsapp-groups"], queryFn: fetchGroups });
  const suspendidos = data?.groups ?? [];
  const suspendidoIds = new Set(suspendidos.map((g) => g.chatId));

  const [buscando, setBuscando] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const q = norm(query.trim());
  const resultados = q
    ? (groupsData?.groups ?? []).filter((g) => !suspendidoIds.has(g.chatId) && norm(g.name || g.chatId).includes(q)).slice(0, 8)
    : [];

  async function cambiar(chatId: string, suspendido: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/groups/suspendidos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, suspendido }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Error");
        return;
      }
      qc.invalidateQueries({ queryKey: ["wa-suspendidos"] });
      setQuery("");
      setBuscando(false);
    } catch {
      setError("Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
            <BellOff className="h-4 w-4 text-text-muted" /> Grupos suspendidos ({suspendidos.length})
          </h2>
          <p className="text-xs text-text-muted">
            No reciben ningún aviso automático (apertura, ACTIVO, posible baja, programados) aunque sigan
            configurados. Lo que entre mientras tanto no se reenvía al reactivar. Tarda hasta 1 min en aplicarse.
          </p>
        </div>
        {!buscando && (
          <Button size="sm" onClick={() => setBuscando(true)}
            className="h-8 gap-1.5 bg-warning text-xs text-white hover:bg-warning/90">
            <BellOff className="h-3.5 w-3.5" /> Suspender grupo
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-critical/40 bg-critical-dim px-3 py-2 text-xs text-critical">{error}</p>
      )}

      {buscando && (
        <div className="space-y-1 rounded-md border border-border bg-accent/5 p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar grupo a suspender…"
              className="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-8 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
            />
            <button type="button" onClick={() => { setBuscando(false); setQuery(""); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
              <X className="h-4 w-4" />
            </button>
          </div>
          {q && resultados.length === 0 && <p className="px-2 py-1 text-xs text-text-muted">Sin coincidencias</p>}
          {resultados.map((g) => (
            <button key={g.chatId} type="button" disabled={busy} onClick={() => void cambiar(g.chatId, true)}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-elevated">
              <span className="truncate">{g.name || g.chatId}</span>
              <span className="text-xs text-warning">Suspender</span>
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-text-muted">Cargando…</p>
      ) : suspendidos.length === 0 ? (
        <p className="text-sm text-text-muted">Ningún grupo suspendido: todos reciben sus avisos.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {suspendidos.map((g) => (
            <li key={g.chatId} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="truncate text-sm text-text-primary">{g.name || g.chatId}</span>
              <Button size="sm" disabled={busy} onClick={() => void cambiar(g.chatId, false)}
                className="h-7 gap-1.5 bg-success text-xs text-white hover:bg-success/90">
                <PlayCircle className="h-3.5 w-3.5" /> Reactivar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
