// ─────────────────────────────────────────────────────────────────────────────
// ESTATUS CLIENTE TOP — tipos y lógica PURA de IMs (sin DB ni red).
//
// Vive aparte de cliente-top-run.ts (que sí toca DB/WhatsApp) para poder
// probar `unirIms` como unidad sin arrastrar Prisma.
// ─────────────────────────────────────────────────────────────────────────────

import { MAX_IMS } from "@/lib/imEstatus";
import type { ClienteTopItem } from "@/lib/cliente-top-estatus";

/** Un cliente destino de una corrida: su grupo de WhatsApp y sus IMs. */
export interface GrupoEnvio {
  /** Grupo WhatsApp destino (xxxx@g.us). */
  chatId: string;
  /** Etiqueta del encabezado (nombre del cliente). */
  etiqueta: string;
  /** Prefijo a recortar del Site Name (normalmente el nombre del cliente). */
  prefijo: string;
  /** IMs abiertos del cliente. */
  items: ClienteTopItem[];
}

/**
 * Unión de los IMs de todos los grupos para mandárselos al scraper en UNA sola
 * consulta: normaliza (`trim().toUpperCase()`), deduplica (un IM que matchea a
 * dos clientes se consulta una vez) y recorta a `MAX_IMS` (red de seguridad del
 * scraper). El orden preserva la primera aparición.
 */
export function unirIms(grupos: GrupoEnvio[]): string[] {
  const vistos = new Set<string>();
  for (const grupo of grupos) {
    for (const it of grupo.items) {
      const im = it.incidentId.trim().toUpperCase();
      if (im) vistos.add(im);
    }
  }
  return [...vistos].slice(0, MAX_IMS);
}

/** Resultado del envío a un grupo (cliente). */
export interface EnvioResultado {
  chatId: string;
  etiqueta: string;
  ok: boolean;
  error?: string;
}

/** Resumen de una corrida de envíos, con el DETALLE de los que fallaron. */
export interface ResumenEnvios {
  ok: boolean;
  enviados: number;
  fallidos: number;
  /** Qué cliente falló y por qué — para el log del cron (no solo un conteo). */
  fallos: { chatId: string; etiqueta: string; error?: string }[];
}

/**
 * Agrega los resultados de envío por cliente en un resumen que PRESERVA cuál
 * falló y su causa. La corrida automática (cron) depende de esto: un "fallidos:
 * 1" a secas no dice qué supervisión quedó sin su estatus.
 */
export function resumirEnvios(resultados: EnvioResultado[]): ResumenEnvios {
  let enviados = 0;
  const fallos: { chatId: string; etiqueta: string; error?: string }[] = [];
  for (const r of resultados) {
    if (r.ok) enviados++;
    else fallos.push({ chatId: r.chatId, etiqueta: r.etiqueta, error: r.error });
  }
  return { ok: fallos.length === 0, enviados, fallidos: fallos.length, fallos };
}
