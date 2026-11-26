import { logger } from "./logger.js";

/**
 * Medición de tiempos por FASE del cierre/consulta de IMs, para saber de dónde
 * salen los ~3 min por IM antes de recortar esperas a ciegas.
 *
 * Desactivada por defecto: solo mide y loguea cuando CERRAR_PERF=1 (o true/yes).
 * Así las corridas normales no se ensucian con líneas de perf.
 *
 * Uso:
 *   const perf = nuevaMedicion("IMXYZ000123");
 *   perf.marca("abrir-menu");
 *   ...trabajo...
 *   perf.marca("buscador-listo");
 *   ...
 *   perf.fin();   // imprime el reparto: fase → ms, y el total
 *
 * Cada marca() cierra la fase anterior (el tiempo transcurrido desde la marca
 * previa, o desde el inicio para la primera) y abre una nueva etiqueta. No lanza
 * nunca: medir jamás debe tumbar un cierre.
 */

export const PERF_ON = /^(1|true|yes)$/i.test((process.env.CERRAR_PERF ?? "").trim());

export interface Medicion {
  /** Cierra la fase en curso y nombra la siguiente. */
  marca(fase: string): void;
  /** Cierra la última fase e imprime el reparto completo + total. */
  fin(): void;
}

const NOOP: Medicion = { marca: () => {}, fin: () => {} };

export function nuevaMedicion(etiqueta: string): Medicion {
  if (!PERF_ON) return NOOP;

  const inicio = Date.now();
  let ultimo = inicio;
  let faseActual = "inicio";
  const fases: Array<{ fase: string; ms: number }> = [];

  return {
    marca(fase: string): void {
      const ahora = Date.now();
      fases.push({ fase: faseActual, ms: ahora - ultimo });
      ultimo = ahora;
      faseActual = fase;
    },
    fin(): void {
      const ahora = Date.now();
      fases.push({ fase: faseActual, ms: ahora - ultimo });
      const total = ahora - inicio;
      const reparto = fases
        .filter((f) => f.ms > 0)
        .map((f) => `${f.fase}=${(f.ms / 1000).toFixed(1)}s`)
        .join(" · ");
      logger.info(`[perf] ${etiqueta}: total=${(total / 1000).toFixed(1)}s | ${reparto}`);
    },
  };
}
