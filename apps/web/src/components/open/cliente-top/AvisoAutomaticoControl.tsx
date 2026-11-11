"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Loader2, Pencil } from "lucide-react";
import { GroupPicker, type WhatsappGroup } from "@/components/monitoring/GroupPicker";
import type { ClienteTopStat } from "./clienteTopUtils";

// ─────────────────────────────────────────────────────────────────────────────
// Control ADMIN del AVISO AUTOMÁTICO de un Cliente TOP: asigna (o quita) el grupo
// de WhatsApp al que el cron 09:00/20:00 manda el estatus de ese cliente. El
// grupo se guarda en ClienteTop.notificarChatId/Name (PUT /api/clientes-top/:id).
// Un cliente sin grupo no entra en la corrida automática.
// ─────────────────────────────────────────────────────────────────────────────

export function AvisoAutomaticoControl({ cliente }: { cliente: ClienteTopStat }) {
  const qc = useQueryClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [groups, setGroups] = useState<WhatsappGroup[]>([]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsAdmin(d.role === "ADMIN"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!editing) return;
    fetch("/api/whatsapp/groups")
      .then((r) => r.json())
      .then((d: { groups?: WhatsappGroup[] }) => setGroups(d.groups ?? []))
      .catch(() => {});
  }, [editing]);

  const guardar = useMutation({
    mutationFn: async ({ chatId, chatName }: { chatId: string | null; chatName: string | null }) => {
      const res = await fetch(`/api/clientes-top/${cliente.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // PUT reemplaza el registro: se mandan company/siglasIm/serviceRef
        // actuales (como el rename) para no pisarlos, más el grupo nuevo.
        body: JSON.stringify({
          company: cliente.company,
          siglasIm: cliente.siglasIm,
          serviceRef: cliente.serviceRef,
          note: cliente.note ?? "",
          notificarChatId: chatId,
          notificarChatName: chatName,
        }),
      });
      if (!res.ok) throw new Error("No se pudo guardar el grupo");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clientes-top-stats"] });
      setEditing(false);
    },
  });

  if (!isAdmin) return null;

  function elegir(chatId: string) {
    const nombre = groups.find((g) => g.chatId === chatId)?.name ?? null;
    guardar.mutate({ chatId, chatName: nombre });
  }

  const activo = !!cliente.notificarChatId;
  const etiquetaGrupo = cliente.notificarChatName || cliente.notificarChatId;

  return (
    <div className="rounded-xl border border-border/60 bg-surface/50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {activo ? (
          <>
            <Bell className="h-3.5 w-3.5 shrink-0 text-success" />
            <span className="text-text-muted">Aviso automático →</span>
            <span className="font-semibold text-text-primary">{etiquetaGrupo}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="flex items-center gap-1 rounded p-1 text-text-muted hover:text-accent"
                title="Cambiar grupo"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={guardar.isPending}
                onClick={() => guardar.mutate({ chatId: null, chatName: null })}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-critical hover:bg-critical-dim disabled:opacity-50"
                title="Quitar aviso automático"
              >
                {guardar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellOff className="h-3.5 w-3.5" />}
                Quitar
              </button>
            </div>
          </>
        ) : (
          <>
            <BellOff className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            <span className="text-text-muted">Sin aviso automático</span>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="ml-auto flex items-center gap-1 rounded-md border border-border px-2 py-1 font-semibold text-text-primary hover:border-accent/50 hover:text-accent"
            >
              <Bell className="h-3.5 w-3.5" />
              Activar aviso
            </button>
          </>
        )}
      </div>

      {editing && (
        <div className="mt-2 border-t border-border/50 pt-2">
          <p className="mb-2 text-[11px] text-text-muted">
            Elige el grupo de WhatsApp al que llegará el estatus de este cliente (09:00 y 20:00).
          </p>
          <GroupPicker value={[]} onChange={(v) => v.length && elegir(v[v.length - 1])} groups={groups} />
          {guardar.isError && (
            <p className="mt-1 text-[11px] text-critical">No se pudo guardar. Intenta de nuevo.</p>
          )}
        </div>
      )}
    </div>
  );
}
