import { db } from "@/lib/db";
import { sendWhatsappViaListener } from "@/lib/whatsapp";
import { isChatSuspendido } from "@/lib/wa-suspendidos";
import type { OpenRecordLite } from "@/lib/war-room";

// ─────────────────────────────────────────────────────────────────────────────
// ALERTA DE POSIBLE BAJA: el ADMIN marca a mano un número de Servicio (REF
// completo, ej. "C20-2210-0003") que identificó como probablemente dado de
// baja en HPSM aunque la base aún no lo refleje. Si ESE Servicio exacto vuelve
// a aparecer en una carga futura de Incidentes Abiertos, se avisa por
// WhatsApp a los grupos que el ADMIN eligió al marcarlo.
// "Nuevo" = primera vez que el incidentId aparece en PosibleBajaNotificada
// (OpenIncident es un snapshot que se recarga completo cada carga del scraper).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_NOTE = "*REVISAR PREVIOS, Posible baja*";

function buildPosibleBajaMessage(data: {
  incidentId: string;
  serviceRef: string;
  company: string;
  siteName: string;
  note: string;
}): string {
  const lines = [
    "🚨 *INCIDENTE*",
    data.incidentId,
    `REF: ${data.serviceRef}`,
    `Company: ${data.company}`,
  ];
  if (data.siteName) lines.push(`Site Name: ${data.siteName}`);
  lines.push("", data.note.trim() || DEFAULT_NOTE);
  return lines.join("\n");
}

/**
 * Revisa el snapshot recién cargado de OpenIncident, cruza el Servicio (REF
 * completo) contra WatchedServiceFlag y notifica las coincidencias nuevas.
 * No debe romper la carga del CSV: cualquier error se atrapa y se loguea,
 * nunca se relanza.
 */
export async function syncPosibleBajaNotify(records: OpenRecordLite[]): Promise<number> {
  // Una fila por incidente (puede abarcar varios sitios).
  const byId = new Map<string, OpenRecordLite>();
  for (const r of records) if (!byId.has(r.incidentId)) byId.set(r.incidentId, r);

  const serviceRefs = [...new Set([...byId.values()].map((r) => r.serviceId))];
  if (serviceRefs.length === 0) return 0;

  const flags = await db.watchedServiceFlag.findMany({
    where: { serviceRef: { in: serviceRefs }, enabled: true },
  });
  if (flags.length === 0) return 0;
  const flagByServiceRef = new Map(flags.map((f) => [f.serviceRef, f]));

  const candidates = [...byId.values()].filter((inc) => flagByServiceRef.has(inc.serviceId));
  if (candidates.length === 0) return 0;

  const existing = await db.posibleBajaNotificada.findMany({
    where: { incidentId: { in: candidates.map((c) => c.incidentId) } },
    select: { incidentId: true },
  });
  const already = new Set(existing.map((e) => e.incidentId));
  const nuevos = candidates.filter((c) => !already.has(c.incidentId));
  if (nuevos.length === 0) return 0;

  let notified = 0;
  for (const inc of nuevos) {
    const flag = flagByServiceRef.get(inc.serviceId);
    if (!flag) continue;
    try {
      const chatIds = flag.notifyChatIds.filter(Boolean);
      if (chatIds.length === 0) {
        console.error("[posible-baja] Sin grupos configurados para", flag.serviceRef);
        continue;
      }

      const text = buildPosibleBajaMessage({
        incidentId: inc.incidentId,
        serviceRef: inc.serviceId,
        company: inc.company,
        siteName: inc.siteName,
        note: flag.note,
      });

      let anyOk = false;
      let firstError: string | null = null;
      for (const chatId of chatIds) {
        const suspendido = await isChatSuspendido(chatId);
        const sent = suspendido
          ? { ok: false as const, status: 0, error: "chat suspendido" }
          : await sendWhatsappViaListener(chatId, text);
        if (sent.ok) anyOk = true;
        else {
          firstError ??= sent.error ?? `wa-listener respondió ${sent.status}`;
          if (!suspendido) {
            console.error("[posible-baja] Falló envío", chatId, sent.error);
          }
        }
      }

      // Se marca notificado aunque el envío haya fallado: evita reintentos
      // infinitos por un chat caído, mismo criterio que la alerta de apertura.
      await db.posibleBajaNotificada.create({
        data: {
          incidentId: inc.incidentId,
          serviceRef: inc.serviceId,
          chatId: chatIds[0] ?? "",
          ok: anyOk,
          error: anyOk ? null : (firstError ?? "Sin grupos configurados").slice(0, 500),
        },
      });
      if (anyOk) notified++;
    } catch (e) {
      console.error("[posible-baja] Error notificando", inc.incidentId, e);
    }
  }

  return notified;
}
