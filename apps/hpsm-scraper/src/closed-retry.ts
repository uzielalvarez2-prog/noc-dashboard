import { logger } from "./logger.js";
import { HpsmSessionLimitError } from "./session.js";

// Reintentos de la descarga de cerrados por PRESUPUESTO DE TIEMPO, no por número fijo.
//
// Contexto: la búsqueda de cerrados de PEXA tarda minutos. Antes se abandonaba a los
// 90 s, la sesión de HPSM quedaba ocupada y 8 intentos cada 2 min se gastaban casi
// todos en "límite de sesiones" (10–14 nov 2026: 3 de 7 corridas fallaron del todo y
// las exitosas tardaron 12–20 min). Ahora:
//   - cada intento espera el listado de corrido (listWaitMs), acotado a lo que cabe
//     en el presupuesto restante;
//   - "límite de sesiones" NO cuenta como intento (ni llegó a buscar) y espera más
//     antes de reintentar: la sesión ocupada tarda minutos en liberarse.
export const MAX_REAL_ATTEMPTS = 5; // intentos que sí llegaron a buscar (o fallaron por otra causa)
export const RETRY_DELAY_MS = 2 * 60_000;
export const SESSION_LIMIT_DELAY_MS = 4 * 60_000;
// Tiempo mínimo restante para que valga la pena empezar otro intento.
export const MIN_ATTEMPT_MS = 6 * 60_000;
// Lo que un intento necesita APARTE de esperar el listado: login, form, export, subida.
export const EXPORT_MARGIN_MS = 3 * 60_000;

/** La descarga agotó su presupuesto de tiempo o de intentos. */
export class DescargaAgotada extends Error {
  constructor(
    readonly ultimoError: Error,
    readonly intentos: number,
    readonly bloqueosSesion: number,
  ) {
    super(ultimoError.message);
    this.name = "DescargaAgotada";
  }
}

export interface RetryOptions {
  /** Un intento de descarga; recibe cuánto puede esperar por el listado (ms). */
  attempt: (listWaitMs: number) => Promise<void>;
  /** Presupuesto TOTAL de la corrida, contado desde `startedAt` (ms). */
  budgetMs: number;
  /** Espera máxima por el listado en cada intento (ms). */
  listWaitMs: number;
  startedAt: number;
  // Inyectables para poder simular el reloj en pruebas.
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Resuelve si algún intento funcionó; lanza DescargaAgotada si se acaba el presupuesto o los intentos. */
export async function downloadWithRetry(opts: RetryOptions): Promise<void> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const deadline = opts.startedAt + opts.budgetMs;
  let intento = 0; // todos, incluidos los bloqueos de sesión
  let reales = 0; // los que no fueron bloqueo de sesión
  let bloqueosSesion = 0;
  let lastError: Error | null = null;

  for (;;) {
    const remaining = deadline - now();
    if (remaining < MIN_ATTEMPT_MS) break;
    intento++;

    // Acota la espera del listado a lo que cabe en el presupuesto restante.
    const listWaitMs = Math.min(opts.listWaitMs, remaining - EXPORT_MARGIN_MS);
    try {
      logger.info(
        `Intento ${intento}: descargando incidentes cerrados ` +
          `(espera de listado hasta ${Math.round(listWaitMs / 60_000)} min, ` +
          `quedan ${Math.round(remaining / 60_000)} min de presupuesto)...`,
      );
      await opts.attempt(listWaitMs);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const porSesion = err instanceof HpsmSessionLimitError;
      if (porSesion) bloqueosSesion++;
      else reales++;

      if (!porSesion && reales >= MAX_REAL_ATTEMPTS) break;
      const delay = porSesion ? SESSION_LIMIT_DELAY_MS : RETRY_DELAY_MS;
      if (deadline - now() - delay < MIN_ATTEMPT_MS) break; // ya no cabe otro intento

      logger.warn(
        `Intento ${intento} falló${porSesion ? " (límite de sesiones, no cuenta como intento)" : ""}: ` +
          `${lastError.message}. Reintentando en ${delay / 1_000}s...`,
      );
      await sleep(delay);
    }
  }
  throw new DescargaAgotada(lastError ?? new Error("Descarga falló (sin detalles)"), intento, bloqueosSesion);
}
