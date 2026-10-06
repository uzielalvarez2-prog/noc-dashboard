import { db } from "@/lib/db";
import { sendWhatsappViaListener } from "@/lib/whatsapp";
import { isResolvedStatus, type OpenRecordLite } from "@/lib/war-room";
import { isChatSuspendido } from "@/lib/wa-suspendidos";
import { cumpleRegla, isAperturaPausada } from "@/lib/apertura-reglas";

// ─────────────────────────────────────────────────────────────────────────────
// ALERTA DE APERTURA: cuando un incidente nuevo cumple alguna AperturaRegla
// activa (Servicio / inicio del IM / fragmento de empresa — ver
// apertura-reglas.ts; panel ADMIN en /reglas-notificacion), se avisa por
// WhatsApp a los grupos de esa regla con @mención al asignado.
// "Nuevo" = primera vez que el incidentId aparece en AperturaNotificada
// (OpenIncident es un snapshot que se recarga completo cada carga del scraper,
// no manda eventos de apertura). Un incidente ya RESOLVED no se notifica: no
// tiene caso avisar la apertura de algo que ya se cerró.
//
// Reglas "por turno": el chat destino depende de la hora (America/Mexico_City)
// al momento de la carga: PEXA Matutino 06:00–15:00, PEXA Vespertino
// 15:00–23:15. Fuera de ambas ventanas (madrugada) cae a Matutino por default.
//
// Con el interruptor global en pausa (AperturaConfig) no se envía nada, pero
// los incidentes nuevos sí se marcan: al reanudar no llega una ráfaga.
// ─────────────────────────────────────────────────────────────────────────────

const CHAT_ID_MATUTINO = (process.env.APERTURA_CHAT_ID_MATUTINO ?? "").trim();
const CHAT_ID_VESPERTINO = (process.env.APERTURA_CHAT_ID_VESPERTINO ?? "").trim();

const TIMEZONE = "America/Mexico_City";

/** Minutos desde medianoche, hora CDMX, para el instante dado. */
function minutesOfDayInMexicoCity(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/**
 * PEXA Matutino: 06:00–15:00. PEXA Vespertino: 15:00–23:15. Fuera de ambas
 * ventanas (23:15–06:00) cae a Matutino por default.
 */
function resolveNotifyChatId(now: Date): string {
  const minutes = minutesOfDayInMexicoCity(now);
  const isVespertino = minutes >= 15 * 60 && minutes < 23 * 60 + 15;
  return isVespertino ? CHAT_ID_VESPERTINO : CHAT_ID_MATUTINO;
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

interface Envio {
  chatId: string;
  reglas: string[];
}

/** Agrupa por chat las reglas que cumple el incidente: un solo mensaje por grupo. */
function destinosDe(
  inc: OpenRecordLite,
  reglas: { nombre: string; servicePrefixes: string; imPrefixes: string; companyContains: string; porTurno: boolean; notifyChatIds: string[] }[],
  now: Date,
): Envio[] {
  const porChat = new Map<string, string[]>();
  for (const r of reglas) {
    if (!cumpleRegla(r, inc)) continue;
    const chats = [...r.notifyChatIds];
    if (r.porTurno) chats.push(resolveNotifyChatId(now));
    for (const chatId of chats.map((c) => c.trim()).filter(Boolean)) {
      const lista = porChat.get(chatId) ?? [];
      if (!lista.includes(r.nombre)) lista.push(r.nombre);
      porChat.set(chatId, lista);
    }
  }
  return [...porChat.entries()].map(([chatId, nombres]) => ({ chatId, reglas: nombres }));
}

/**
 * Revisa el snapshot recién cargado de OpenIncident, detecta aperturas nuevas
 * que cumplen alguna regla activa y notifica por WhatsApp. No debe romper la
 * carga del CSV: cualquier error se atrapa y se loguea, nunca se relanza.
 */
export async function syncAperturaNotify(records: OpenRecordLite[]): Promise<number> {
  const reglas = await db.aperturaRegla.findMany({ where: { enabled: true } });
  if (reglas.length === 0) return 0;

  // Una fila por incidente (puede abarcar varios sitios).
  const byId = new Map<string, OpenRecordLite>();
  for (const r of records) if (!byId.has(r.incidentId)) byId.set(r.incidentId, r);

  const now = new Date();
  const candidates = [...byId.values()]
    .filter((inc) => !isResolvedStatus(inc.status))
    .map((inc) => ({ inc, envios: destinosDe(inc, reglas, now) }))
    .filter((c) => c.envios.length > 0);
  if (candidates.length === 0) return 0;

  const existing = await db.aperturaNotificada.findMany({
    where: { incidentId: { in: candidates.map((c) => c.inc.incidentId) } },
    select: { incidentId: true },
  });
  const already = new Set(existing.map((e) => e.incidentId));
  const nuevos = candidates.filter((c) => !already.has(c.inc.incidentId));
  if (nuevos.length === 0) return 0;

  const pausado = await isAperturaPausada();

  let notified = 0;
  for (const { inc, envios } of nuevos) {
    try {
      const assigneePhone = pausado
        ? ""
        : await resolveAssigneePhone(inc.assignee).catch((err) => {
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
      // Si el asignado no está en el chat, wa-listener descarta la línea "@..."
      // y manda el resto igual — la alerta nunca se pierde por la mención.
      const mentions = assigneePhone ? [phoneToJid(assigneePhone)] : [];

      for (const { chatId, reglas: nombres } of envios) {
        // Pausa global o grupo suspendido: no se envía, pero SÍ se marca en
        // AperturaNotificada (con ok=false y el motivo) para no re-avisar
        // al reanudar.
        const motivo = pausado
          ? "pausado (interruptor global de /reglas-notificacion)"
          : isChatSuspendido(chatId)
            ? "chat suspendido (WA_CHATS_SUSPENDIDOS)"
            : null;
        const sent = motivo
          ? { ok: false as const, status: 0, error: motivo }
          : await sendWhatsappViaListener(chatId, text, mentions);
        if (!sent.ok && !motivo) {
          console.error("[apertura] Falló envío de alerta de apertura", chatId, sent.error);
        }

        // Se marca notificado aunque el envío haya fallado: evita reintentos
        // infinitos por el chat caído; el patrón de este flujo prioriza no
        // repetir el aviso sobre garantizar la entrega. Por eso el resultado
        // del envío se guarda aquí: es el único rastro de una entrega perdida.
        await db.aperturaNotificada.create({
          data: {
            incidentId: inc.incidentId,
            serviceId: inc.serviceId,
            chatId,
            ok: sent.ok,
            error: sent.ok ? null : (sent.error ?? `wa-listener respondió ${sent.status}`).slice(0, 500),
            regla: nombres.join(", ").slice(0, 200),
          },
        });
        if (sent.ok) notified++;
      }
    } catch (e) {
      console.error("[apertura] Error notificando apertura", inc.incidentId, e);
    }
  }

  return notified;
}
