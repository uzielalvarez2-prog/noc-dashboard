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

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Prefijo alfabético del Incident ID (siglas IM), ej. "IMLATB001124" → "imlatb". */
function incidentPrefix(incidentId: string): string {
  return norm(incidentId.replace(/\d+$/, ""));
}

/**
 * ¿El incidente pertenece a ESTE cliente TOP? Reusa la misma lógica de match que
 * syncWarRoom (company / serviceRef / siglasIm) pero para un solo cliente, para
 * no mezclar incidentes de otros clientes TOP (WarRoom guarda TODOS juntos).
 */
function matcheaCliente(
  inc: { incidentId: string; company: string; serviceId: string },
  cliente: { company: string; serviceRef: string; siglasIm: string },
): boolean {
  const co = norm(inc.company);
  const sv = norm(inc.serviceId);
  const prefix = incidentPrefix(inc.incidentId);
  const cCo = norm(cliente.company);
  const cSv = norm(cliente.serviceRef);
  const cSi = norm(cliente.siglasIm);
  const companyMatch = cCo.length > 0 && co === cCo;
  const serviceMatch = cSv.length > 0 && sv === cSv;
  // Siglas: contra el prefijo del IM (formato estándar) y contra la company
  // (algunos clientes se identifican por su acrónimo ahí).
  const siglasMatch = cSi.length > 0 && (prefix === cSi || co === cSi);
  return companyMatch || serviceMatch || siglasMatch;
}

/**
 * IMs abiertos (no resueltos) del cliente TOP indicado, con su Site Name tomado
 * del snapshot vigente de OpenIncident. Ordena por hora de apertura (más viejo
 * primero), que es como el equipo los revisa.
 */
async function obtenerItems(cliente: {
  company: string;
  serviceRef: string;
  siglasIm: string;
}): Promise<ClienteTopItem[]> {
  const war = await db.warRoomIncident.findMany({
    where: { dismissed: false, group: "PEXA" },
    orderBy: { openTime: "asc" },
  });
  const abiertos = war
    .filter((w) => !isResolvedStatus(w.status))
    .filter((w) => matcheaCliente(w, cliente));
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
 * Corre una emisión completa de estatus de UN Cliente TOP y la envía al grupo.
 *
 * @param clienteTopId  id del ClienteTop a reportar. Si se omite y hay EXACTAMENTE
 *                      un cliente TOP, se usa ese (modo 1 cliente). Con varios,
 *                      es obligatorio (si no, error) para no mezclar incidentes.
 * @param chatId  grupo destino (xxxx@g.us).
 * @param prefijoSitio  nombre del cliente a recortar del Site Name (ej. "SMART FIT").
 * @param etiquetaCliente  etiqueta del encabezado (ej. "PEXA").
 * @param enviarSiVacio  si false y no hay IMs, NO manda nada (devuelve sinIms).
 */
export async function correrEstatusClienteTop(opts: {
  clienteTopId?: string;
  chatId: string;
  prefijoSitio: string;
  etiquetaCliente?: string;
  enviarSiVacio?: boolean;
}): Promise<ClienteTopRunResult> {
  const chatId = opts.chatId.trim();
  if (!chatId) return { ok: false, sinIms: false, ims: 0, error: "chatId no configurado" };

  // Resolver el cliente TOP a reportar.
  const id = (opts.clienteTopId ?? "").trim();
  let cliente: { company: string; serviceRef: string; siglasIm: string } | null = null;
  if (id) {
    cliente = await db.clienteTop.findUnique({
      where: { id },
      select: { company: true, serviceRef: true, siglasIm: true },
    });
    if (!cliente) return { ok: false, sinIms: false, ims: 0, error: "Cliente TOP no encontrado" };
  } else {
    const todos = await db.clienteTop.findMany({
      select: { company: true, serviceRef: true, siglasIm: true },
    });
    if (todos.length === 1) cliente = todos[0];
    else if (todos.length === 0)
      return { ok: false, sinIms: false, ims: 0, error: "No hay clientes TOP registrados" };
    else
      return {
        ok: false,
        sinIms: false,
        ims: 0,
        error: "Hay varios clientes TOP: especifica cuál (clienteTopId).",
      };
  }

  const items = await obtenerItems(cliente);

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
