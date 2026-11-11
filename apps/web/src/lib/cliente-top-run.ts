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
import type { ImEstatusResult } from "@/lib/imEstatus";
import { sendWhatsappViaListener } from "@/lib/whatsapp";
import { buildClienteTopMessage, type ClienteTopItem } from "@/lib/cliente-top-estatus";
import { unirIms, resumirEnvios, type GrupoEnvio, type EnvioResultado, type ResumenEnvios } from "@/lib/cliente-top-ims";

const SCRAPER_URL = process.env.SCRAPER_URL ?? "";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

export interface DispararResult {
  ok: boolean;
  /** IMs únicos que se mandaron a consultar (unión de todos los clientes). */
  ims: number;
  /** Clientes destino de esta corrida. */
  targets: number;
  sinIms: boolean;
  /** true si ya se arrancó la consulta en el scraper. */
  iniciado: boolean;
  error?: string;
}

/** Tope de IMs por cliente: más que esto es señal de filtro roto (no un cliente). */
const TOPE_IMS_CLIENTE = 30;

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

  // Se incluyen también los RESOLVED: el mensaje los muestra en su propia
  // sección ("Resueltos por cerrar"). El armado (buildClienteTopMessage) separa
  // en gestión vs resueltos usando el status.
  const vistos = new Set<string>();
  const items: ClienteTopItem[] = [];
  for (const o of open) {
    if (!matcheaCliente(o, cliente)) continue;
    if (vistos.has(o.incidentId)) continue; // primera fila del IM (un IM = varios sitios)
    vistos.add(o.incidentId);
    items.push({ incidentId: o.incidentId, ref: o.serviceId, siteName: o.siteName, status: o.status });
  }
  return items;
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
 * PASO 1 — DISPARAR. Reúne los clientes destino, junta sus IMs en UNA sola
 * consulta y se la manda al scraper, que consulta HPSM y al terminar hace
 * callback a /api/cliente-top/enviar. Rápido: no espera a la consulta.
 *
 * Dos modos:
 *   - MANUAL (`clienteTopId` presente): un cliente, con el `chatId` dado. Si tiene
 *     más de 30 IMs se ABORTA (señal de filtro roto).
 *   - CRON (sin `clienteTopId`): todos los clientes con `notificarChatId`, cada uno
 *     a SU grupo. Un cliente con >30 IMs se EXCLUYE (no aborta a los demás).
 *
 * Si no hay IMs que consultar y `enviarSiVacio` es true, NO pasa por el scraper:
 * manda directo el mensaje "0 en gestión" a cada grupo.
 */
export async function dispararEstatusClienteTop(opts: {
  clienteTopId?: string;
  chatId?: string;
  enviarSiVacio: boolean;
}): Promise<DispararResult> {
  const clienteTopId = (opts.clienteTopId ?? "").trim();
  const targets: GrupoEnvio[] = [];
  const excluidos: string[] = [];

  if (clienteTopId) {
    // MODO MANUAL: un cliente, con el grupo que mandó el caller.
    const chatId = (opts.chatId ?? "").trim();
    if (!chatId)
      return { ok: false, ims: 0, targets: 0, sinIms: false, iniciado: false, error: "Falta el grupo destino (chatId)" };
    const cliente = await resolverCliente(clienteTopId);
    if ("error" in cliente)
      return { ok: false, ims: 0, targets: 0, sinIms: false, iniciado: false, error: cliente.error };
    const items = await obtenerItems(cliente);
    const etiqueta = cliente.company.trim() || "PEXA";
    if (items.length > TOPE_IMS_CLIENTE) {
      return {
        ok: false,
        ims: items.length,
        targets: 0,
        sinIms: false,
        iniciado: false,
        error: `Filtro sospechoso: ${items.length} IMs para un cliente (tope ${TOPE_IMS_CLIENTE}). Se abortó para no agotar HPSM. Revisa el registro del cliente TOP (company/serviceRef/siglasIm).`,
      };
    }
    targets.push({ chatId, etiqueta, prefijo: etiqueta, items });
  } else {
    // MODO CRON: todos los clientes con grupo de aviso asignado, cada uno al suyo.
    const marcados = await db.clienteTop.findMany({
      where: { NOT: { notificarChatId: null } },
      select: { company: true, serviceRef: true, siglasIm: true, notificarChatId: true },
    });
    for (const c of marcados) {
      const chatId = (c.notificarChatId ?? "").trim();
      if (!chatId) continue; // cadena vacía = sin aviso
      const items = await obtenerItems(c);
      const etiqueta = c.company.trim() || "PEXA";
      if (items.length > TOPE_IMS_CLIENTE) {
        excluidos.push(`${c.company}: ${items.length} IMs (>${TOPE_IMS_CLIENTE})`);
        continue;
      }
      targets.push({ chatId, etiqueta, prefijo: etiqueta, items });
    }
  }

  if (excluidos.length > 0)
    console.warn("[cliente-top] clientes excluidos por tope de IMs:", excluidos.join("; "));

  // Sin clientes destino (nadie marcado, o todos excluidos): nada que hacer.
  if (targets.length === 0) return { ok: true, ims: 0, targets: 0, sinIms: true, iniciado: false };

  const ims = unirIms(targets);

  // Sin IMs que consultar: no se pasa por el scraper. Si se pidió avisar igual,
  // se manda directo "0 en gestión" a cada grupo.
  if (ims.length === 0) {
    if (!opts.enviarSiVacio) return { ok: true, ims: 0, targets: targets.length, sinIms: true, iniciado: false };
    const enviado = await enviarMensajesClienteTop(targets, []);
    return {
      ok: enviado.ok,
      ims: 0,
      targets: targets.length,
      sinIms: true,
      iniciado: false,
      error: enviado.ok ? undefined : `Fallaron ${enviado.fallidos} de ${targets.length} envío(s)`,
    };
  }

  // Con IMs: delegar al scraper (consulta HPSM + callback de envío con `grupos`).
  if (!SCRAPER_URL || !INTERNAL_API_KEY) {
    return { ok: false, ims: ims.length, targets: targets.length, sinIms: false, iniciado: false, error: "SCRAPER_URL / INTERNAL_API_KEY no configuradas" };
  }
  try {
    const res = await fetch(`${SCRAPER_URL.replace(/\/+$/, "")}/cliente-top-estatus`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_API_KEY },
      body: JSON.stringify({ ims, grupos: targets, enviarSiVacio: opts.enviarSiVacio }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, ims: ims.length, targets: targets.length, sinIms: false, iniciado: false, error: body?.error ?? `El scraper respondió ${res.status}` };
    }
    return { ok: true, ims: ims.length, targets: targets.length, sinIms: false, iniciado: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error de red";
    return { ok: false, ims: ims.length, targets: targets.length, sinIms: false, iniciado: false, error: `No se pudo contactar el scraper: ${msg}` };
  }
}

/**
 * PASO 3 — ENVIAR. Por cada grupo (cliente) arma su mensaje con los resultados
 * del scraper y lo manda a SU chatId. Lo llama el callback del scraper
 * (/api/cliente-top/enviar) y el disparo directo cuando no hay IMs. Un fallo de
 * envío no detiene a los demás grupos. Rápido.
 */
export async function enviarMensajesClienteTop(
  grupos: GrupoEnvio[],
  resultados: ImEstatusResult[],
): Promise<ResumenEnvios> {
  const estatus = new Map<string, ImEstatusResult>();
  for (const r of resultados) estatus.set(r.im, r);

  const envios: EnvioResultado[] = [];
  for (const grupo of grupos) {
    const mensaje = buildClienteTopMessage(grupo.items, estatus, {
      etiquetaCliente: grupo.etiqueta,
      prefijoSitio: grupo.prefijo,
    });
    const sent = await sendWhatsappViaListener(grupo.chatId, mensaje);
    if (!sent.ok) {
      // En la corrida automática nadie mira: deja constancia de QUÉ cliente y
      // por qué quedó sin su estatus (no solo un conteo).
      console.error(
        `[cliente-top] envío fallido · ${grupo.etiqueta} (${grupo.chatId}): ${sent.error ?? "error desconocido"}`,
      );
    }
    envios.push({ chatId: grupo.chatId, etiqueta: grupo.etiqueta, ok: sent.ok, error: sent.error });
  }
  return resumirEnvios(envios);
}
