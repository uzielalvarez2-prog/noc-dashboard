// Puente dashboard → hpsm-scraper para CERRAR incidentes en HPSM aplicando un
// template. Mismo patrón que lib/imEstatus.ts: el scraper corre la operación en
// segundo plano (job run-cerrar) y aquí solo se arranca y se lee el progreso.
// Los resultados viven en el scraper (no se guardan en Postgres).

const SCRAPER_URL = process.env.SCRAPER_URL ?? "";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

/** Mismo formato que acepta el scraper (apps/hpsm-scraper/src/hpsm-incident.ts). */
export const IM_REGEX = /^IM[A-Z0-9]{4,20}$/;
export const MAX_CERRAR = 50;

export type ModoCierre = "verificar" | "aplicar" | "cerrar";

export interface ItemCierre {
  im: string;
  template: string;
}

export interface CierreResult {
  im: string;
  template: string;
  modo: ModoCierre;
  ok: boolean;
  resultado: string; // "verificado" | "aplicado" | "cerrado" | "ya-cerrado" | "no-encontrado" | "template-no-existe" | "error"
  mensaje: string;
  statusPrevio?: string;
}

export interface ProgresoCierre {
  estado: "inactivo" | "en_cola" | "cerrando" | "terminado" | "error";
  total: number;
  modo: ModoCierre;
  iniciadoEn: string | null;
  terminadoEn: string | null;
  mensaje: string | null;
}

interface ScraperResponse<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

/** Extrae los IMs de un texto pegado (uno por línea, con comas, tabs, etc.). */
export function extraerIms(texto: string): string[] {
  const encontrados = texto.toUpperCase().match(/\bIM[A-Z0-9]{4,20}\b/g) ?? [];
  return [...new Set(encontrados)];
}

/** Etiqueta legible + color para el resultado de un cierre. */
export function resultadoLabel(r: CierreResult): string {
  switch (r.resultado) {
    case "cerrado":
      return "Cerrado";
    case "verificado":
      return "Listo para cerrar";
    case "aplicado":
      return "Template aplicado";
    case "ya-cerrado":
      return "Ya estaba cerrado";
    case "no-encontrado":
      return "No encontrado";
    case "template-no-existe":
      return "Template no existe";
    default:
      return "Error";
  }
}

async function llamarScraper<T>(path: string, init: RequestInit): Promise<ScraperResponse<T>> {
  if (!SCRAPER_URL) return { ok: false, status: 500, error: "SCRAPER_URL no configurada" };
  if (!INTERNAL_API_KEY) return { ok: false, status: 500, error: "INTERNAL_API_KEY no configurada" };

  let res: Response;
  try {
    res = await fetch(`${SCRAPER_URL.replace(/\/+$/, "")}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_API_KEY },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error de red";
    return { ok: false, status: 502, error: `No se pudo contactar el scraper: ${msg}` };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* respuesta no-JSON */
  }
  if (!res.ok) {
    const err = (body as { error?: unknown } | null)?.error;
    return { ok: false, status: res.status, error: typeof err === "string" ? err : `El scraper respondió ${res.status}` };
  }
  return { ok: true, status: res.status, data: body as T };
}

/** Pide al scraper arrancar el cierre. No espera a que termine. No lanza. */
export function iniciarCierre(items: ItemCierre[], modo: ModoCierre) {
  return llamarScraper<{ total: number; modo: ModoCierre }>("/cerrar-incidentes", {
    method: "POST",
    body: JSON.stringify({ items, modo }),
  });
}

/** Progreso + resultados (parciales o finales) de la corrida de cierre. No lanza. */
export function consultarProgresoCierre() {
  return llamarScraper<{ progreso: ProgresoCierre; resultados: CierreResult[] }>("/cerrar-incidentes/progreso", {
    method: "GET",
  });
}
