// ─────────────────────────────────────────────────────────────────────────────
// ESTATUS CLIENTE TOP — orquestación server-side (una corrida completa).
//
// Reúne piezas que YA existen:
//   1. WarRoomIncident  → qué IMs del cliente TOP están abiertos (no resueltos).
//   2. OpenIncident      → Site Name de cada IM (WarRoom no lo guarda).
//   3. lib/imEstatus      → el scraper consulta HPSM (estatus + última nota).
//   4. lib/whatsapp       → envía el mensaje al grupo.
//   5. lib/cliente-top-estatus → arma el texto.
//
// Es autónoma: arranca la consulta al scraper, espera con polling del lado del
// servidor hasta que termina (o expira), arma el mensaje y lo envía. Pensada
// para dispararse desde el cron del scraper (09:00 / 20:00) y también a mano
// desde un botón ADMIN para pruebas.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { isResolvedStatus } from "@/lib/war-room";
import {
  iniciarConsultaIms,
  consultarProgresoIms,
  MAX_IMS,
  type ImEstatusResult,
  type ProgresoIm,
} from "@/lib/imEstatus";
import { sendWhatsappViaListener } from "@/lib/whatsapp";
import { buildClienteTopMessage, type ClienteTopItem } from "@/lib/cliente-top-estatus";

export interface ClienteTopRunResult {
  ok: boolean;
  /** true si no había IMs abiertos del cliente (igual se puede avisar "0"). */
  sinIms: boolean;
  ims: number;
  mensaje?: string;
  enviado?: boolean;
  error?: string;
}

const POLL_EVERY_MS = 3_000;
// Cada IM tarda ~30 s en HPSM; con 50 IMs tope y margen, 20 min es holgado.
const POLL_TIMEOUT_MS = 20 * 60_000;
const EN_CURSO: ProgresoIm["estado"][] = ["en_cola", "consultando"];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * IMs abiertos (no resueltos) del cliente TOP, con su Site Name tomado del
 * snapshot vigente de OpenIncident. Ordena por hora de apertura (más viejo
 * primero), que es como el equipo los revisa.
 */
async function obtenerItems(): Promise<ClienteTopItem[]> {
  const war = await db.warRoomIncident.findMany({
    where: { dismissed: false, group: "PEXA" },
    orderBy: { openTime: "asc" },
  });
  const abiertos = war.filter((w) => !isResolvedStatus(w.status));
  if (abiertos.length === 0) return [];

  // Site Name desde OpenIncident (una fila por IM basta; un IM masivo abarca
  // varios sitios, pero para este mensaje tomamos el primero visto).
  const ids = abiertos.map((w) => w.incidentId);
  const open = await db.openIncident.findMany({
    where: { incidentId: { in: ids } },
    select: { incidentId: true, siteName: true },
  });
  const siteNamePorId = new Map<string, string>();
  for (const o of open) {
    if (!siteNamePorId.has(o.incidentId) && o.siteName) siteNamePorId.set(o.incidentId, o.siteName);
  }

  return abiertos.map((w) => ({
    incidentId: w.incidentId,
    ref: w.serviceId,
    siteName: siteNamePorId.get(w.incidentId) ?? "",
  }));
}

/**
 * Lanza la consulta de los IMs al scraper y espera (polling) a que termine.
 * Devuelve el mapa incidentId → resultado. Si el scraper no responde o expira,
 * devuelve lo que haya (parcial): el mensaje igual sale, con "sin datos" en los
 * que falten, para no perder la corrida entera por un IM lento.
 */
async function consultarEstatus(ids: string[]): Promise<Map<string, ImEstatusResult>> {
  const porId = new Map<string, ImEstatusResult>();
  if (ids.length === 0) return porId;

  const inicio = await iniciarConsultaIms(ids.slice(0, MAX_IMS));
  if (!inicio.ok) {
    // No se pudo ni arrancar: se devuelve vacío; el mensaje saldrá con "sin datos".
    console.error("[cliente-top] No se pudo iniciar consulta al scraper:", inicio.error);
    return porId;
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  // Primera espera antes de preguntar: el hijo tarda en crear su archivo.
  await sleep(POLL_EVERY_MS);
  while (Date.now() < deadline) {
    const prog = await consultarProgresoIms();
    if (prog.ok && prog.data) {
      for (const r of prog.data.resultados) porId.set(r.im, r);
      if (!EN_CURSO.includes(prog.data.progreso.estado)) break;
    }
    await sleep(POLL_EVERY_MS);
  }
  return porId;
}

/**
 * Corre una emisión completa de estatus del Cliente TOP y la envía al grupo.
 *
 * @param chatId  grupo destino (xxxx@g.us).
 * @param prefijoSitio  nombre del cliente a recortar del Site Name (ej. "SMART FIT").
 * @param etiquetaCliente  etiqueta del encabezado (ej. "PEXA").
 * @param enviarSiVacio  si false y no hay IMs, NO manda nada (devuelve sinIms).
 */
export async function correrEstatusClienteTop(opts: {
  chatId: string;
  prefijoSitio: string;
  etiquetaCliente?: string;
  enviarSiVacio?: boolean;
}): Promise<ClienteTopRunResult> {
  const chatId = opts.chatId.trim();
  if (!chatId) return { ok: false, sinIms: false, ims: 0, error: "chatId no configurado" };

  const items = await obtenerItems();

  if (items.length === 0 && opts.enviarSiVacio === false) {
    return { ok: true, sinIms: true, ims: 0, enviado: false };
  }

  const estatus = await consultarEstatus(items.map((i) => i.incidentId));

  const mensaje = buildClienteTopMessage(items, estatus, {
    etiquetaCliente: opts.etiquetaCliente,
    prefijoSitio: opts.prefijoSitio,
  });

  const sent = await sendWhatsappViaListener(chatId, mensaje);
  if (!sent.ok) {
    return { ok: false, sinIms: items.length === 0, ims: items.length, mensaje, enviado: false, error: sent.error };
  }

  return { ok: true, sinIms: items.length === 0, ims: items.length, mensaje, enviado: true };
}
