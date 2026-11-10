// ─────────────────────────────────────────────────────────────────────────────
// ESTATUS CLIENTE TOP — orquestación (arquitectura sin timeout).
//
// El trabajo lento (consultar HPSM IM por IM, ~4 min) NO puede correr en el
// dashboard: Vercel corta la función y el navegador el fetch. Por eso se reparte:
//
//   DISPARAR (rápido, aquí):  lee los IMs abiertos del cliente TOP (WarRoom +
//     OpenIncident) y se los manda al SCRAPER (/cliente-top-estatus). Responde ya.
//   CONSULTAR (lento, scraper 24/7): entra a HPSM por cada IM.
//   ENVIAR (rápido, aquí): el scraper hace callback a /api/cliente-top/enviar con
//     los resultados; ahí se arma el mensaje y se manda al grupo.
//
// Así nada espera 4 min con una conexión abierta, y funciona aunque se cierre la
// ventana (el scraper remata solo). Mismo patrón que SISA/Manto.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { isResolvedStatus } from "@/lib/war-room";
import { MAX_IMS, type ImEstatusResult } from "@/lib/imEstatus";
import { sendWhatsappViaListener } from "@/lib/whatsapp";
import { buildClienteTopMessage, type ClienteTopItem } from "@/lib/cliente-top-estatus";

const SCRAPER_URL = process.env.SCRAPER_URL ?? "";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

export interface DispararResult {
  ok: boolean;
  /** IMs del cliente que se mandaron a consultar. */
  ims: number;
  sinIms: boolean;
  /** true si ya se arrancó la consulta en el scraper. */
  iniciado: boolean;
  error?: string;
}

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
  const siglasMatch = cSi.length > 0 && (prefix === cSi || co === cSi);
  return companyMatch || serviceMatch || siglasMatch;
}

/**
 * IMs abiertos del cliente TOP indicado, leídos del snapshot ACTUAL de
 * OpenIncident (la foto del momento, que se reemplaza en cada carga del CSV).
 *
 * OJO: NO se lee de WarRoomIncident. Esa tabla PERSISTE 7 días de histórico, así
 * que traía todos los incidentes que alguna vez fueron del cliente (daba 954
 * para SMART FIT en vez de los ~9 abiertos de hoy). OpenIncident solo contiene lo
 * que está abierto ahora. Se deduplica por incidentId (un IM puede abarcar varios
 * sitios → varias filas) y se ordena por apertura (más viejo primero).
 */
async function obtenerItems(cliente: {
  company: string;
  serviceRef: string;
  siglasIm: string;
}): Promise<ClienteTopItem[]> {
  const open = await db.openIncident.findMany({
    where: { group: "PEXA" },
    orderBy: { openTime: "asc" },
    select: {
      incidentId: true,
      company: true,
      serviceId: true,
      siteName: true,
      status: true,
    },
  });

  const vistos = new Set<string>();
  const items: ClienteTopItem[] = [];
  for (const o of open) {
    if (isResolvedStatus(o.status)) continue;
    if (!matcheaCliente(o, cliente)) continue;
    if (vistos.has(o.incidentId)) continue; // primera fila del IM (un IM = varios sitios)
    vistos.add(o.incidentId);
    items.push({ incidentId: o.incidentId, ref: o.serviceId, siteName: o.siteName });
  }
  return items;
}

/** DIAGNÓSTICO TEMPORAL: qué cliente se resolvió y cuántos IMs matchean. */
export async function diagnosticarClienteTop(clienteTopId?: string) {
  const todosClientes = await db.clienteTop.findMany({
    select: { id: true, company: true, serviceRef: true, siglasIm: true, note: true },
  });
  const cliente = await resolverCliente(clienteTopId);
  if ("error" in cliente) {
    return { error: cliente.error, todosClientes, clienteTopIdRecibido: clienteTopId ?? null };
  }
  const open = await db.openIncident.findMany({
    where: { group: "PEXA" },
    select: { incidentId: true, company: true, serviceId: true, status: true, siteName: true },
  });
  const noResueltos = open.filter((o) => !isResolvedStatus(o.status));
  const matchean = noResueltos.filter((o) => matcheaCliente(o, cliente));
  const unicos = [...new Map(matchean.map((m) => [m.incidentId, m])).values()];
  return {
    clienteTopIdRecibido: clienteTopId ?? null,
    clienteResuelto: cliente,
    totalClientesTop: todosClientes.length,
    openPexaTotal: open.length,
    openNoResueltos: noResueltos.length,
    matcheanConCliente: matchean.length,
    imsUnicos: unicos.length,
    primeros: unicos.slice(0, 15).map((m) => ({ im: m.incidentId, co: m.company, sv: m.serviceId, site: m.siteName })),
  };
}

/** Resuelve el ClienteTop a reportar (por id, o el único si solo hay uno). */
async function resolverCliente(
  clienteTopId?: string,
): Promise<{ company: string; serviceRef: string; siglasIm: string } | { error: string }> {
  const id = (clienteTopId ?? "").trim();
  if (id) {
    const c = await db.clienteTop.findUnique({
      where: { id },
      select: { company: true, serviceRef: true, siglasIm: true },
    });
    return c ?? { error: "Cliente TOP no encontrado" };
  }
  const todos = await db.clienteTop.findMany({
    select: { company: true, serviceRef: true, siglasIm: true },
  });
  if (todos.length === 1) return todos[0];
  if (todos.length === 0) return { error: "No hay clientes TOP registrados" };
  return { error: "Hay varios clientes TOP: especifica cuál (clienteTopId)." };
}

/**
 * PASO 1 — DISPARAR. Lee los IMs del cliente y se los manda al scraper para que
 * consulte HPSM y, al terminar, haga callback a /api/cliente-top/enviar. Rápido:
 * no espera a la consulta. Si no hay IMs y enviarSiVacio es true, NO pasa por el
 * scraper (no hay nada que consultar): manda directo el mensaje "0 IMs".
 */
export async function dispararEstatusClienteTop(opts: {
  clienteTopId?: string;
  chatId: string;
  prefijoSitio: string;
  etiquetaCliente: string;
  enviarSiVacio: boolean;
}): Promise<DispararResult> {
  const chatId = opts.chatId.trim();
  if (!chatId) return { ok: false, ims: 0, sinIms: false, iniciado: false, error: "chatId no configurado" };

  const cliente = await resolverCliente(opts.clienteTopId);
  if ("error" in cliente) return { ok: false, ims: 0, sinIms: false, iniciado: false, error: cliente.error };

  const items = await obtenerItems(cliente);

  // RED DE SEGURIDAD: un solo cliente TOP no debería tener decenas de IMs
  // abiertos. Si el filtro devuelve un número absurdo (p.ej. 954), es que NO
  // está filtrando y traería todo WarRoom — abortar sin consultar HPSM ni
  // enviar, para no agotar sesiones de HPSM ni mandar un mensaje basura.
  const TOPE_IMS_CLIENTE = 30;
  if (items.length > TOPE_IMS_CLIENTE) {
    return {
      ok: false,
      ims: items.length,
      sinIms: false,
      iniciado: false,
      error: `Filtro sospechoso: ${items.length} IMs para un cliente (tope ${TOPE_IMS_CLIENTE}). Se abortó para no agotar HPSM. Revisa el registro del cliente TOP (company/serviceRef/siglasIm).`,
    };
  }

  // Sin IMs: no hay nada que consultar en HPSM. Si se pidió avisar igual, se
  // manda directo el mensaje "0 IMs" (rápido, sin scraper).
  if (items.length === 0) {
    if (!opts.enviarSiVacio) return { ok: true, ims: 0, sinIms: true, iniciado: false };
    const enviado = await enviarMensajeClienteTop({
      chatId,
      prefijo: opts.prefijoSitio,
      etiqueta: opts.etiquetaCliente,
      items: [],
      resultados: [],
    });
    return { ok: enviado.ok, ims: 0, sinIms: true, iniciado: false, error: enviado.error };
  }

  // Con IMs: delegar al scraper (consulta HPSM + callback de envío).
  if (!SCRAPER_URL || !INTERNAL_API_KEY) {
    return { ok: false, ims: items.length, sinIms: false, iniciado: false, error: "SCRAPER_URL / INTERNAL_API_KEY no configuradas" };
  }
  try {
    const res = await fetch(`${SCRAPER_URL.replace(/\/+$/, "")}/cliente-top-estatus`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_API_KEY },
      body: JSON.stringify({
        ims: items.slice(0, MAX_IMS).map((i) => i.incidentId),
        chatId,
        prefijo: opts.prefijoSitio,
        etiqueta: opts.etiquetaCliente,
        items,
        enviarSiVacio: opts.enviarSiVacio,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, ims: items.length, sinIms: false, iniciado: false, error: body?.error ?? `El scraper respondió ${res.status}` };
    }
    return { ok: true, ims: items.length, sinIms: false, iniciado: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error de red";
    return { ok: false, ims: items.length, sinIms: false, iniciado: false, error: `No se pudo contactar el scraper: ${msg}` };
  }
}

/**
 * PASO 3 — ENVIAR. Arma el mensaje con los resultados que devuelve el scraper y
 * lo manda al grupo. Lo llama el callback del scraper (/api/cliente-top/enviar),
 * y también el disparo directo cuando no hay IMs. Rápido.
 */
export async function enviarMensajeClienteTop(data: {
  chatId: string;
  prefijo: string;
  etiqueta: string;
  items: ClienteTopItem[];
  resultados: ImEstatusResult[];
}): Promise<{ ok: boolean; mensaje: string; error?: string }> {
  const estatus = new Map<string, ImEstatusResult>();
  for (const r of data.resultados) estatus.set(r.im, r);

  const mensaje = buildClienteTopMessage(data.items, estatus, {
    etiquetaCliente: data.etiqueta,
    prefijoSitio: data.prefijo,
  });

  const sent = await sendWhatsappViaListener(data.chatId, mensaje);
  return { ok: sent.ok, mensaje, error: sent.ok ? undefined : sent.error };
}
