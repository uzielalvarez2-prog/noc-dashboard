import { db } from "@/lib/db";
import { sendWhatsappViaListener } from "@/lib/whatsapp";
import type { OpenRecordLite } from "@/lib/war-room";

// ─────────────────────────────────────────────────────────────────────────────
// ALERTA DE APERTURA: cuando un incidente nuevo entra con Servicio en la lista
// vigilada (prefijo antes del primer guion de OpenIncident.serviceId, ej.
// "C20-1808-0004" → "C20"), se avisa por WhatsApp a PEXA Matutino/Vespertino con
// @mención al asignado. "Nuevo" = primera vez que el incidentId aparece en
// AperturaNotificada (OpenIncident es un snapshot que se recarga completo cada
// carga del scraper, no manda eventos de apertura).
// ─────────────────────────────────────────────────────────────────────────────

const WATCHED_SERVICES = new Set(
  (process.env.APERTURA_SERVICIOS ?? "C00,C20,C25,C50,C1G,G2B,G4B")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
);

const NOTIFY_CHAT_IDS = (process.env.APERTURA_CHAT_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function servicePrefix(serviceId: string): string {
  return (serviceId.split("-")[0] ?? "").trim().toUpperCase();
}

function phoneToJid(phone: string): string {
  return `${phone}@c.us`;
}

function buildAperturaMessage(data: {
  siglasIm: string;
  incidentId: string;
  serviceRef: string;
  company: string;
  assigneePhone: string;
}): string {
  const header = data.siglasIm || data.incidentId;
  const lines = [
    "🚨 *INCIDENTE*",
    header,
    `REF: ${data.serviceRef}`,
    `Company: ${data.company}`,
  ];
  if (data.assigneePhone) lines.push("", `@${data.assigneePhone}`);
  return lines.join("\n");
}

/** Teléfono del asignado vía AgentContact; "" si no hay asignado o no está mapeado. */
async function resolveAssigneePhone(assignee: string | null): Promise<string> {
  const name = (assignee ?? "").trim().toLowerCase();
  if (!name) return "";
  const contact = await db.agentContact.findUnique({ where: { hpsmName: name } });
  if (!contact || !contact.enabled) return "";
  return contact.phone;
}

/**
 * Revisa el snapshot recién cargado de OpenIncident, detecta aperturas nuevas
 * de servicios vigilados y notifica por WhatsApp. No debe romper la carga del
 * CSV: cualquier error se atrapa y se loguea, nunca se relanza.
 */
export async function syncAperturaNotify(records: OpenRecordLite[]): Promise<number> {
  if (WATCHED_SERVICES.size === 0 || NOTIFY_CHAT_IDS.length === 0) return 0;

  // Una fila por incidente (puede abarcar varios sitios).
  const byId = new Map<string, OpenRecordLite>();
  for (const r of records) if (!byId.has(r.incidentId)) byId.set(r.incidentId, r);

  const candidates = [...byId.values()].filter((inc) =>
    WATCHED_SERVICES.has(servicePrefix(inc.serviceId))
  );
  if (candidates.length === 0) return 0;

  const existing = await db.aperturaNotificada.findMany({
    where: { incidentId: { in: candidates.map((c) => c.incidentId) } },
    select: { incidentId: true },
  });
  const already = new Set(existing.map((e) => e.incidentId));
  const nuevos = candidates.filter((c) => !already.has(c.incidentId));
  if (nuevos.length === 0) return 0;

  let notified = 0;
  for (const inc of nuevos) {
    try {
      const assigneePhone = await resolveAssigneePhone(inc.assignee).catch((err) => {
        console.error("[apertura] Error resolviendo asignado", err);
        return "";
      });

      const text = buildAperturaMessage({
        siglasIm: inc.incidentId,
        incidentId: inc.incidentId,
        serviceRef: inc.serviceId,
        company: inc.company,
        assigneePhone,
      });
      const mentions = assigneePhone ? [phoneToJid(assigneePhone)] : [];

      for (const chatId of NOTIFY_CHAT_IDS) {
        const sent = await sendWhatsappViaListener(chatId, text, mentions);
        if (!sent.ok) {
          console.error("[apertura] Falló envío de alerta de apertura", chatId, sent.error);
        }
      }

      // Se marca notificado aunque algún envío haya fallado: evita reintentos
      // infinitos por un grupo caído; el patrón de este flujo prioriza no
      // repetir el aviso sobre garantizar entrega a todos los destinos.
      await db.aperturaNotificada.create({
        data: { incidentId: inc.incidentId, serviceId: inc.serviceId },
      });
      notified++;
    } catch (e) {
      console.error("[apertura] Error notificando apertura", inc.incidentId, e);
    }
  }

  return notified;
}
