import { db } from "@/lib/db";
import { isResolvedStatus } from "@/lib/war-room";

// ─────────────────────────────────────────────────────────────────────────────
// REGLAS DE LA ALERTA DE APERTURA (tabla AperturaRegla, panel ADMIN en
// /reglas-notificacion). Una regla se cumple cuando el incidente cumple TODOS
// sus criterios no vacíos:
//   - servicePrefixes: prefijo antes del primer guion de serviceId ("C20-1808-0004" → "C20")
//   - imPrefixes:      inicio del incidentId ("IMSMAG000123" empieza con "IMSMAG")
//   - companyContains: fragmento del nombre de empresa, sin mayúsculas ni acentos
// En servicePrefixes/imPrefixes la coma separa alternativas (O). La empresa es
// un solo fragmento: los nombres de empresa traen comas.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReglaCriterios {
  servicePrefixes: string;
  imPrefixes: string;
  companyContains: string;
}

/** Cuerpo de POST/PATCH en /api/apertura-reglas. */
export interface ReglaBody {
  nombre?: string;
  servicePrefixes?: string;
  imPrefixes?: string;
  companyContains?: string;
  porTurno?: boolean;
  notifyChatIds?: string[];
  enabled?: boolean;
}

export interface IncidenteParaRegla {
  incidentId: string;
  serviceId: string;
  company: string;
}

/** Mayúsculas, sin acentos y con espacios colapsados: "Secretaría  de" → "SECRETARIA DE". */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "c20, C25 ,," → ["C20","C25"]. */
export function parseList(s: string): string[] {
  return s
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
}

export function servicePrefix(serviceId: string): string {
  return (serviceId.split("-")[0] ?? "").trim().toUpperCase();
}

export function tieneCriterios(r: ReglaCriterios): boolean {
  return parseList(r.servicePrefixes).length > 0 || parseList(r.imPrefixes).length > 0 || normalizeText(r.companyContains) !== "";
}

export function cumpleRegla(r: ReglaCriterios, inc: IncidenteParaRegla): boolean {
  if (!tieneCriterios(r)) return false;

  const servicios = parseList(r.servicePrefixes);
  if (servicios.length > 0 && !servicios.includes(servicePrefix(inc.serviceId))) return false;

  const ims = parseList(r.imPrefixes);
  const incidentId = inc.incidentId.trim().toUpperCase();
  if (ims.length > 0 && !ims.some((p) => incidentId.startsWith(p))) return false;

  const empresa = normalizeText(r.companyContains);
  if (empresa && !normalizeText(inc.company).includes(empresa)) return false;

  return true;
}

/**
 * Al crear/activar/cambiar criterios de una regla: marca como "ya avisados"
 * (sin enviar) los incidentes abiertos que hoy la cumplen, para que la regla
 * solo avise de incidentes NUEVOS y no dispare una ráfaga de golpe.
 * Devuelve cuántos incidentes se marcaron.
 */
export async function marcarAbiertosExistentes(r: ReglaCriterios & { nombre: string }): Promise<number> {
  const abiertos = await db.openIncident.findMany({
    select: { incidentId: true, serviceId: true, company: true, status: true },
    distinct: ["incidentId"],
  });
  const candidatos = abiertos.filter((inc) => !isResolvedStatus(inc.status) && cumpleRegla(r, inc));
  if (candidatos.length === 0) return 0;

  // Los que ya tienen fila (avisados por otra regla) no se tocan.
  const existentes = await db.aperturaNotificada.findMany({
    where: { incidentId: { in: candidatos.map((c) => c.incidentId) } },
    select: { incidentId: true },
  });
  const ya = new Set(existentes.map((e) => e.incidentId));
  const cumplen = candidatos.filter((c) => !ya.has(c.incidentId));
  if (cumplen.length === 0) return 0;

  const res = await db.aperturaNotificada.createMany({
    data: cumplen.map((inc) => ({
      incidentId: inc.incidentId,
      serviceId: inc.serviceId,
      chatId: "",
      ok: false,
      error: "omitido: ya estaba abierto al activar la regla",
      regla: r.nombre.slice(0, 200),
    })),
    skipDuplicates: true,
  });
  return res.count;
}

export async function isAperturaPausada(): Promise<boolean> {
  const cfg = await db.aperturaConfig.findUnique({ where: { id: "global" } });
  return cfg?.pausado ?? false;
}
