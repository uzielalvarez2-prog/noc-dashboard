// Puente dashboard → hpsm-scraper para consultar estatus + últimas actividades
// de una lista de IMs directo en HPSM. Mismo patrón que lib/manto.ts: el
// scraper corre la consulta en segundo plano y aquí solo se arranca y se lee
// el progreso. Los resultados viven en el scraper (no se guardan en Postgres).

const SCRAPER_URL = process.env.SCRAPER_URL ?? "";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

/** Mismo formato que acepta el scraper (apps/hpsm-scraper/src/hpsm-incident.ts). */
export const IM_REGEX = /^IM[A-Z0-9]{4,20}$/;
export const MAX_IMS = 50;

export interface ImActividad {
  fecha: string; // tal cual HPSM, "YY/MM/DD HH:mm:ss"
  operador: string;
  tipo: string;
  descripcion: string;
}

export interface ImEstatusResult {
  im: string;
  found: boolean;
  status?: string;
  cerrado?: boolean;
  actividades?: ImActividad[];
  error?: string;
}

export interface ProgresoIm {
  estado: "inactivo" | "en_cola" | "consultando" | "terminado" | "error";
  total: number;
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

/** Texto listo para pegar en WhatsApp (*negritas* con la sintaxis de WA). */
export function textoWhatsapp(resultados: ImEstatusResult[]): string {
  return resultados
    .map((r) => {
      const lineas = [`*${r.im}*`];
      if (r.error) {
        lineas.push("Estatus: no se pudo consultar");
      } else if (!r.found) {
        lineas.push("Estatus: no encontrado en HPSM");
      } else if (r.cerrado) {
        lineas.push("Estatus: Cerrado");
      } else {
        lineas.push(`Estatus: ${r.status || "(sin estatus)"}`);
        for (const a of r.actividades ?? []) {
          lineas.push(`• ${a.fecha} – ${a.tipo}: ${a.descripcion}`);
        }
      }
      return lineas.join("\n");
    })
    .join("\n\n");
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

/** Pide al scraper arrancar la consulta. No espera a que termine. No lanza. */
export function iniciarConsultaIms(ims: string[]) {
  return llamarScraper<{ total: number }>("/im-estatus", { method: "POST", body: JSON.stringify({ ims }) });
}

/** Progreso + resultados parciales de la consulta en curso (o de la última). No lanza. */
export function consultarProgresoIms() {
  return llamarScraper<{ progreso: ProgresoIm; resultados: ImEstatusResult[] }>("/im-estatus/progreso", {
    method: "GET",
  });
}
