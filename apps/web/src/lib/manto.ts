// Puente dashboard → hpsm-scraper (Railway) para CONSULTAR estatus de folios
// SISA en el portal Manto. El dashboard no puede scrapear Manto: requiere
// Playwright/Chromium, que solo existe en el contenedor del scraper. Mismo
// patrón y mismo x-internal-key que lib/whatsapp.ts → wa-listener.

const SCRAPER_URL = process.env.SCRAPER_URL ?? "";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

/** Resultado por folio tal como lo devuelve el scraper (apps/hpsm-scraper/src/manto.ts). */
export interface MantoEstatusResult {
  folio: string;
  found: boolean;
  estadoEms?: string;
  estadoEfa?: string;
  fechaEstadoEfa?: string; // "dd/mm/aaaa hh:mm:ss" tal cual lo reporta Manto
  fechaEstadoEms?: string; // "F/H Ini." del EMS — la que el EDC usa como "Inicio:"
  notasEfa?: string; // resumen de notas del EFA para la línea "Estatus:" del EDC
  error?: string;
}

/** Estado de la corrida en el scraper (la consulta corre en segundo plano). */
export interface ProgresoRefresh {
  enCurso: boolean;
  total: number;
  consultados: number;
  encontrados: number;
  iniciadoEn: string | null;
  terminadoEn: string | null;
  ultimoMensaje: string | null;
  portalFueraDeGestion: boolean;
}

export interface ConsultaEstatusResult {
  ok: boolean;
  status: number;
  /** true cuando el scraper aceptó la corrida y la está ejecutando en segundo plano. */
  iniciado?: boolean;
  total?: number;
  progreso?: ProgresoRefresh;
  error?: string;
  /** El portal Manto está caído (error de SQL/servidor o sin respuesta). */
  portalFueraDeGestion?: boolean;
}

/** Mensaje único que se muestra al usuario cuando el portal no está dando servicio. */
export const PORTAL_FUERA_DE_GESTION_MSG = "Portal fuera de gestión";

/**
 * Pide al scraper ARRANCAR la consulta de estos folios en Manto. Responde en
 * cuanto el scraper acepta la corrida (no espera a que termine: son ~18 s por
 * folio). El scraper va guardando cada resultado vía /api/sisa/estatus-parcial.
 * No lanza: devuelve {ok,status,error}.
 */
export async function iniciarConsultaEstatusSisa(folios: string[]): Promise<ConsultaEstatusResult> {
  if (!SCRAPER_URL) {
    return { ok: false, status: 500, error: "SCRAPER_URL no configurada" };
  }
  if (!INTERNAL_API_KEY) {
    return { ok: false, status: 500, error: "INTERNAL_API_KEY no configurada" };
  }
  if (folios.length === 0) {
    return { ok: true, status: 200, iniciado: false, total: 0 };
  }

  const base = SCRAPER_URL.replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/sisa-estatus`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({ folios }),
      // Solo se espera el ACK del arranque, no la corrida.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error de red";
    return { ok: false, status: 502, error: `No se pudo contactar el scraper: ${msg}` };
  }

  let body: {
    error?: unknown;
    portalFueraDeGestion?: unknown;
    total?: unknown;
    progreso?: ProgresoRefresh;
  } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* respuesta no-JSON */
  }

  if (!res.ok) {
    if (body.portalFueraDeGestion === true) {
      return {
        ok: false,
        status: res.status,
        portalFueraDeGestion: true,
        error: PORTAL_FUERA_DE_GESTION_MSG,
      };
    }
    const error = typeof body.error === "string" ? body.error : `El scraper respondió ${res.status}`;
    return { ok: false, status: res.status, error, progreso: body.progreso };
  }

  return {
    ok: true,
    status: res.status,
    iniciado: true,
    total: typeof body.total === "number" ? body.total : folios.length,
  };
}

/** Lee el progreso de la corrida (en curso o la última). No lanza. */
export async function consultarProgresoSisa(): Promise<ConsultaEstatusResult> {
  if (!SCRAPER_URL) return { ok: false, status: 500, error: "SCRAPER_URL no configurada" };
  if (!INTERNAL_API_KEY) return { ok: false, status: 500, error: "INTERNAL_API_KEY no configurada" };

  const base = SCRAPER_URL.replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/sisa-estatus/progreso`, {
      headers: { "x-internal-key": INTERNAL_API_KEY },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error de red";
    return { ok: false, status: 502, error: `No se pudo contactar el scraper: ${msg}` };
  }

  let body: { progreso?: ProgresoRefresh; error?: unknown } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* respuesta no-JSON */
  }

  if (!res.ok) {
    const error = typeof body.error === "string" ? body.error : `El scraper respondió ${res.status}`;
    return { ok: false, status: res.status, error };
  }
  return { ok: true, status: res.status, progreso: body.progreso };
}

/**
 * Convierte la fecha de Manto ("11/09/2026 18:34:56", hora de pared) a Date.
 * Se interpreta en UTC igual que openTime de HPSM, para que el formateo del
 * dashboard (que usa UTC a propósito) muestre exactamente lo que dice Manto.
 */
export function parseFechaManto(raw: string | undefined): Date | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  const d = new Date(
    Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss ?? "0")),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}
