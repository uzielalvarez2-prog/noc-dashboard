import { db } from "../sync/incidents.js";
import { logger } from "../logger.js";
import { sendWhatsappViaListener } from "./whatsapp.js";
import { isChatSuspendido } from "./suppressed.js";

// ─────────────────────────────────────────────────────────────────────────────
// RECORDATORIOS DE WHATSAPP PROGRAMADOS: mensaje de texto libre redactado por
// el usuario en /whatsapp, con fecha/hora y grupo(s) destino. Este ciclo (cada
// minuto, ver index.ts) busca los que ya cumplieron su sendAt y los envía.
// Envío único — no hay repetición ni reintento tras el primer intento.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reclamo ATÓMICO antes de enviar, mismo patrón que IpMonitor.alertedAt: si el
 * envío a varios grupos tarda más que el intervalo del ciclo, el siguiente
 * ciclo no debe volver a tomar la misma fila. `where sentAt: null` asegura que
 * solo un ciclo se quede con cada mensaje.
 */
async function claim(id: string, now: Date): Promise<boolean> {
  const claimed = await db.scheduledWhatsappMessage.updateMany({
    where: { id, sentAt: null },
    data: { sentAt: now },
  });
  return claimed.count > 0;
}

export async function runScheduledWhatsappCycle(): Promise<void> {
  const now = new Date();
  const due = await db.scheduledWhatsappMessage.findMany({
    where: { sendAt: { lte: now }, sentAt: null, cancelledAt: null },
  });
  if (due.length === 0) return;

  for (const item of due) {
    const claimed = await claim(item.id, now);
    if (!claimed) continue; // otro ciclo ya se lo llevó

    let anyOk = false;
    let firstError: string | null = null;
    for (const chatId of item.notifyChatIds) {
      const suspendido = isChatSuspendido(chatId);
      const sent = suspendido
        ? { ok: false as const, error: "chat suspendido (WA_CHATS_SUSPENDIDOS)" }
        : await sendWhatsappViaListener(chatId, item.text);
      if (sent.ok) anyOk = true;
      else {
        firstError ??= sent.error ?? "error desconocido";
        if (!suspendido) logger.error(`[scheduled-whatsapp] Falló envío a ${chatId}`, { error: sent.error });
      }
    }

    await db.scheduledWhatsappMessage.update({
      where: { id: item.id },
      data: { ok: anyOk, error: anyOk ? null : (firstError ?? "Sin grupos configurados") },
    });

    logger.info(`[scheduled-whatsapp] Procesado ${item.id}: ok=${anyOk}`);
  }
}
