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
