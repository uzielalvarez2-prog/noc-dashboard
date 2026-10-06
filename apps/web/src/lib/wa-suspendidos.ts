// Chats a los que NO se debe entregar, aunque sigan configurados como destino.
//
// Sirve para suspender temporalmente un grupo (p.ej. "PEXA Vespertino") sin
// tocar los destinos guardados (MonitoredIp.notifyChatIds, reglas, etc.).
// Fuente: WhatsappGroup.suspendido (se cambia desde /reglas-notificacion, sin
// redeploy) + la env var WA_CHATS_SUSPENDIDOS="chatId1,chatId2" como respaldo.
// La lista de la DB se cachea CACHE_MS para no consultarla en cada envío.

import { db } from "@/lib/db";

const CACHE_MS = 30_000;

const FROM_ENV = new Set(
  (process.env.WA_CHATS_SUSPENDIDOS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

let cache: { at: number; ids: Set<string> } | null = null;

async function suspendidosEnDb(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.ids;
  try {
    const rows = await db.whatsappGroup.findMany({ where: { suspendido: true }, select: { chatId: true } });
    cache = { at: Date.now(), ids: new Set(rows.map((r) => r.chatId.trim())) };
  } catch (e) {
    // Si la DB falla, se conserva la última lista conocida (o ninguna).
    console.error("[wa-suspendidos] No se pudo leer WhatsappGroup.suspendido", e);
    if (!cache) return new Set();
  }
  return cache?.ids ?? new Set();
}

export async function isChatSuspendido(chatId: string): Promise<boolean> {
  const id = chatId.trim();
  return FROM_ENV.has(id) || (await suspendidosEnDb()).has(id);
}

/** Olvida la caché (tras cambiar la suspensión desde el panel). */
export function invalidarSuspendidos(): void {
  cache = null;
}
