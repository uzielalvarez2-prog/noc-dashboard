import { db } from "@/lib/db";
import { sendWhatsappViaListener } from "@/lib/whatsapp";
import { isResolvedStatus, type OpenRecordLite } from "@/lib/war-room";
import { isChatSuspendido } from "@/lib/wa-suspendidos";
import { cumpleRegla, isAperturaPausada } from "@/lib/apertura-reglas";
import {
  buscarContactoSader,
  correosPara,
  SADER_CORREO_CC,
  type SaderContactoLite,
} from "@/lib/sader-contactos";

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

/**
 * Formato de la línea de ubicación del mensaje de apertura:
 *  - "company": línea "Company: <empresa>" (default interno).
 *  - "sitio":   línea "Sitio: <site name>" en vez de Company (chats de cliente).
 *  - "empresaYsitio": empresa como *encabezado* (2ª línea, estilo SADER) + línea
 *    "Sitio: <site name>"; la línea Sitio se omite si no hay sitio.
 */
type ModoUbicacion = "company" | "sitio" | "empresaYsitio";

function buildAperturaMessage(data: {
  siglasIm: string;
  incidentId: string;
  serviceRef: string;
  company: string;
  sitio: string;
  modo: ModoUbicacion;
  /** Notas extra de las reglas (notaExtra); cada una va como línea al final. */
  notas: string[];
  assigneePhone: string;
}): string {
  const header = data.siglasIm || data.incidentId;
  const lines = ["🚨 *INCIDENTE*"];
  // Empresa como encabezado (2ª línea) solo en modo empresaYsitio.
  if (data.modo === "empresaYsitio" && data.company.trim()) lines.push(`*${data.company.trim()}*`);
  lines.push(header, `REF: ${data.serviceRef}`);

  if (data.modo === "company") lines.push(`Company: ${data.company}`);
  else if (data.sitio) lines.push(`Sitio: ${data.sitio}`); // "sitio" y "empresaYsitio": omite si no hay sitio

  for (const nota of data.notas) lines.push(nota);
  if (data.assigneePhone) lines.push("", `@${data.assigneePhone}`);
  return lines.join("\n");
}

/**
 * Plantilla enriquecida SADER. Con match en el Excel (por REF): Company como
 * encabezado, Sitio de la col C, correos (default + col I sin duplicar) + CC,
 * y Contacto/teléfono de la col F/G. Sin match: solo el correo default + CC y
 * el Sitio que trae el incidente. Lleva @mención al asignado al final.
 */
function buildSaderMessage(data: {
  company: string;
  incidentId: string;
  serviceRef: string;
  /** Sitio del incidente (fallback cuando no hay match en el Excel). */
  sitioIncidente: string;
  contacto: SaderContactoLite | null;
  notas: string[];
  assigneePhone: string;
}): string {
  const lines = ["🚨 *INCIDENTE*"];
  if (data.company.trim()) lines.push(`*${data.company.trim()}*`);
  lines.push(data.incidentId, `REF: ${data.serviceRef}`);

  const sitio = data.contacto?.sitio.trim() || data.sitioIncidente.trim();
  if (sitio) lines.push(`Sitio: ${sitio}`);

  const correos = correosPara(data.contacto);
  lines.push(`Enviar correo a: ${correos.join("; ")}`);
  lines.push(`CC: ${SADER_CORREO_CC}`);

  if (data.contacto) {
    const contacto = data.contacto.contacto.trim().replace(/\s*\n\s*/g, " / ");
    const tel = data.contacto.telefono.trim();
    if (contacto || tel) {
      lines.push(`Contacto: ${contacto}${contacto && tel ? "  " : ""}${tel ? `tel. ${tel}` : ""}`);
    }
  }

  for (const nota of data.notas) lines.push(nota);
  if (data.assigneePhone) lines.push("", `@${data.assigneePhone}`);
  return lines.join("\n");
}

/**
 * Sitio(s) del incidente para el mensaje de cliente: Site Name; si viene
 * vacío, "municipio, estado". Lo normal es un sitio por IM; si un IM abarca
 * varios (masivo), primer sitio + conteo para no mandar un mensaje kilométrico.
 */
function describirSitio(filas: OpenRecordLite[]): string {
  const sitios = [
    ...new Set(
      filas
        .map((f) => f.siteName.trim() || [f.district, f.state].map((x) => x.trim()).filter(Boolean).join(", "))
        .filter(Boolean),
    ),
  ];
  if (sitios.length <= 1) return sitios[0] ?? "";
  return `${sitios[0]} (+${sitios.length - 1} sitios)`;
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
  mostrarSitio: boolean;
  // true si alguna regla que manda a este chat pide empresa (encabezado) + Sitio.
  mostrarEmpresaSitio: boolean;
  // true si alguna regla que manda a este chat pide entregar aunque esté suspendido.
  ignorarSuspension: boolean;
  // Notas extra de las reglas que mandan a este chat (una línea por nota, sin repetir).
  notas: string[];
  // true si alguna regla que manda a este chat usa la plantilla enriquecida SADER.
  plantillaSader: boolean;
}

/** Agrupa por chat las reglas que cumple el incidente: un solo mensaje por grupo. */
function destinosDe(
  inc: OpenRecordLite,
  reglas: {
    nombre: string;
    servicePrefixes: string;
    imPrefixes: string;
    companyContains: string;
    porTurno: boolean;
    mostrarSitio: boolean;
    mostrarEmpresaSitio: boolean;
    ignorarSuspension: boolean;
    notaExtra: string;
    plantillaSader: boolean;
    notifyChatIds: string[];
  }[],
  now: Date,
): Envio[] {
  const porChat = new Map<string, Envio>();
  for (const r of reglas) {
    if (!cumpleRegla(r, inc)) continue;
    const chats = [...r.notifyChatIds];
    if (r.porTurno) chats.push(resolveNotifyChatId(now));
    for (const chatId of chats.map((c) => c.trim()).filter(Boolean)) {
      const envio =
        porChat.get(chatId) ??
        { chatId, reglas: [], mostrarSitio: false, mostrarEmpresaSitio: false, ignorarSuspension: false, notas: [], plantillaSader: false };
      if (!envio.reglas.includes(r.nombre)) envio.reglas.push(r.nombre);
      // Si alguna regla que manda a este chat pide Sitio, el chat recibe Sitio.
      envio.mostrarSitio ||= r.mostrarSitio;
      // Si alguna regla que manda a este chat pide Empresa+Sitio, el chat lo recibe.
      envio.mostrarEmpresaSitio ||= r.mostrarEmpresaSitio;
      // Si alguna regla que manda a este chat ignora la suspensión, el chat la recibe.
      envio.ignorarSuspension ||= r.ignorarSuspension;
      // Si alguna regla que manda a este chat usa la plantilla SADER, el chat la usa.
      envio.plantillaSader ||= r.plantillaSader;
      const nota = r.notaExtra.trim();
      if (nota && !envio.notas.includes(nota)) envio.notas.push(nota);
      porChat.set(chatId, envio);
    }
  }
  return [...porChat.values()];
}

/**
 * Revisa el snapshot recién cargado de OpenIncident, detecta aperturas nuevas
 * que cumplen alguna regla activa y notifica por WhatsApp. No debe romper la
 * carga del CSV: cualquier error se atrapa y se loguea, nunca se relanza.
 */
export async function syncAperturaNotify(records: OpenRecordLite[]): Promise<number> {
  const reglas = await db.aperturaRegla.findMany({ where: { enabled: true } });
  if (reglas.length === 0) return 0;

  // Una fila por incidente (puede abarcar varios sitios); todas sus filas para el Sitio.
  const byId = new Map<string, OpenRecordLite>();
  const filasPorId = new Map<string, OpenRecordLite[]>();
  for (const r of records) {
    if (!byId.has(r.incidentId)) byId.set(r.incidentId, r);
    const filas = filasPorId.get(r.incidentId);
    if (filas) filas.push(r);
    else filasPorId.set(r.incidentId, [r]);
  }

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

      const base = {
        siglasIm: inc.incidentId,
        incidentId: inc.incidentId,
        serviceRef: inc.serviceId,
        company: inc.company,
        assigneePhone,
      };
      const sitio = describirSitio(filasPorId.get(inc.incidentId) ?? [inc]);
      // Si el asignado no está en el chat, wa-listener descarta la línea "@..."
      // y manda el resto igual — la alerta nunca se pierde por la mención.
      const mentions = assigneePhone ? [phoneToJid(assigneePhone)] : [];

      // Contacto SADER: se busca una sola vez por incidente, y solo si algún
      // envío usa la plantilla SADER (evita la consulta en el 99% de casos).
      const usaSader = envios.some((e) => e.plantillaSader);
      const contactoSader = usaSader
        ? await buscarContactoSader(inc.serviceId).catch((err) => {
            console.error("[apertura] Error buscando contacto SADER", err);
            return null;
          })
        : null;

      for (const { chatId, reglas: nombres, mostrarSitio, mostrarEmpresaSitio, ignorarSuspension, notas, plantillaSader } of envios) {
        // Modo de ubicación: empresaYsitio (empresa encabezado + sitio) tiene
        // prioridad sobre "sitio"; si ninguno, el formato interno "company".
        const modo: ModoUbicacion = mostrarEmpresaSitio ? "empresaYsitio" : mostrarSitio ? "sitio" : "company";
        const text = plantillaSader
          ? buildSaderMessage({
              company: inc.company,
              incidentId: inc.incidentId,
              serviceRef: inc.serviceId,
              sitioIncidente: sitio,
              contacto: contactoSader,
              notas,
              assigneePhone,
            })
          : buildAperturaMessage({ ...base, sitio, modo, notas });
        // Pausa global o grupo suspendido: no se envía, pero SÍ se marca en
        // AperturaNotificada (con ok=false y el motivo) para no re-avisar
        // al reanudar. Una regla con ignorarSuspension entrega aunque el grupo
        // esté suspendido (la pausa global sigue mandando sobre todo).
        const motivo = pausado
          ? "pausado (interruptor global de /reglas-notificacion)"
          : !ignorarSuspension && (await isChatSuspendido(chatId))
            ? "chat suspendido"
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
