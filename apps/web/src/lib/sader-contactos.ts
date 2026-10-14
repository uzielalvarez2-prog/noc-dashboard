// Plantilla enriquecida SADER: cruza el REF (serviceId) del incidente contra
// SaderContacto.referencia (col B del Excel). Los contactos se sincronizan a la
// DB con scripts/importar-sader.ts. Se cachea la tabla CACHE_MS para no
// consultarla en cada envío.

import { db } from "@/lib/db";

// Correos constantes (van siempre, aunque no haya match).
export const SADER_CORREO_DEFAULT = "jeronimo.geminiano@agricultura.gob.mx";
export const SADER_CORREO_CC = "sop.pex@uninet.com.mx";

const CACHE_MS = 60_000;

export interface SaderContactoLite {
  referencia: string;
  sitio: string;
  contacto: string;
  telefono: string;
  correos: string[];
}

let cache: { at: number; byRef: Map<string, SaderContactoLite> } | null = null;

async function contactosEnDb(): Promise<Map<string, SaderContactoLite>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.byRef;
  try {
    const rows = await db.saderContacto.findMany({
      select: { referencia: true, sitio: true, contacto: true, telefono: true, correos: true },
    });
    const byRef = new Map(rows.map((r) => [normalizeRef(r.referencia), r]));
    cache = { at: Date.now(), byRef };
  } catch (e) {
    console.error("[sader-contactos] No se pudo leer SaderContacto", e);
    if (!cache) return new Map();
  }
  return cache?.byRef ?? new Map();
}

/** Solo dígitos: el REF del incidente y la col B pueden traer formato/espacios distintos. */
export function normalizeRef(ref: string): string {
  return (ref ?? "").replace(/\D/g, "");
}

/** Contacto SADER para un REF, o null si no hay match. Invalidado por el import. */
export async function buscarContactoSader(ref: string): Promise<SaderContactoLite | null> {
  const key = normalizeRef(ref);
  if (!key) return null;
  return (await contactosEnDb()).get(key) ?? null;
}

/** Olvida la caché (tras reimportar el Excel). */
export function invalidarContactosSader(): void {
  cache = null;
}

/**
 * Lista final de correos "para": el default primero, luego los de la col I que
 * no se repitan (sin importar mayúsculas). El CC (sop.pex) va aparte, no aquí.
 */
export function correosPara(contacto: SaderContactoLite | null): string[] {
  const out: string[] = [SADER_CORREO_DEFAULT];
  const vistos = new Set([SADER_CORREO_DEFAULT.toLowerCase()]);
  for (const c of contacto?.correos ?? []) {
    const correo = c.trim();
    const k = correo.toLowerCase();
    if (correo && !vistos.has(k)) {
      vistos.add(k);
      out.push(correo);
    }
  }
  return out;
}
