// ─────────────────────────────────────────────────────────────────────────────
// ESTATUS CLIENTE TOP → WhatsApp
//
// Arma el mensaje de estatus de los IMs abiertos de un Cliente TOP para enviarlo
// a un grupo (ej. "Supervision PEXA"), una corrida en la mañana y otra en la
// tarde. La consulta del estatus + última nota a HPSM la hace el scraper
// (lib/imEstatus.ts → consultarIncidente); aquí solo se FORMATEA.
//
// Decisiones acordadas con el equipo (2026-11-10):
//   - Encabezado con 📊, fecha CDMX y conteo de IMs en gestión.
//   - Por IM: emoji de número + IM en negrita, REF, Site Name, Estatus.
//   - "Estatus" = ÚLTIMA entrada de la bitácora tal cual (sin saltar las
//     automáticas de HPSM tipo "Incident Status Change" / reasignaciones).
//   - Site Name con el nombre del cliente recortado SOLO en el mensaje
//     (ej. "SMART FIT SENDERA COLIMA" → "SENDERA COLIMA"); en el dashboard el
//     Site Name se conserva completo.
// ─────────────────────────────────────────────────────────────────────────────

import type { ImEstatusResult } from "@/lib/imEstatus";
import { isResolvedStatus } from "@/lib/war-room";

const TIMEZONE = "America/Mexico_City";

/** Un IM del Cliente TOP con los datos que trae el snapshot de abiertos. */
export interface ClienteTopItem {
  incidentId: string;
  /** Referencia del servicio (serviceId / Affected Service). */
  ref: string;
  /** Site Name tal cual el CSV (sin recortar). */
  siteName: string;
  /** Status del snapshot (OpenIncident), para separar "en gestión" vs "resuelto por cerrar". */
  status: string;
}

/** Fecha legible en español, hora CDMX, para el encabezado del mensaje. */
export function fechaEncabezado(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Quita el nombre del cliente del inicio del Site Name, sin distinguir
 * mayúsculas/acentos, y limpia el separador que quede. Si el sitio NO empieza
 * con el prefijo, o quedaría vacío (el sitio ERA solo el nombre del cliente),
 * se devuelve el original. Solo afecta al texto del mensaje.
 */
export function recortarSitio(siteName: string, prefijoCliente: string): string {
  const s = (siteName ?? "").trim();
  const c = (prefijoCliente ?? "").trim();
  if (!c) return s;
  const re = new RegExp("^" + escapeRegExp(c) + "\\b[\\s\\-:_]*", "i");
  const out = s.replace(re, "").trim();
  return out || s;
}

const NUMEROS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

function emojiNumero(i: number): string {
  return NUMEROS[i] ?? `${i + 1}.`;
}

/**
 * Texto de la línea "Estatus:" de un IM a partir del resultado del scraper.
 * Toma la última nota REAL del ingeniero, saltando las entradas AUTOMÁTICAS de
 * HPSM (reasignaciones, cambios de estatus, SMBOT, node reset, wizard), que no
 * aportan información del diagnóstico. Si todas las que trae son automáticas,
 * cae a la más reciente (mejor algo que nada); si no hay actividades, al status.
 */

// Entradas automáticas de HPSM (no son notas del ingeniero). Se comparan contra
// la descripción, sin distinguir mayúsculas/acentos.
const PATRONES_NOTA_AUTOMATICA: RegExp[] = [
  /^\s*reassignment from .+ to .+/i, // "Reassignment from nrmartin to dgluis"
  /^\s*individual reassignment from /i, // "Individual reassignment from ..."
  /^\s*incident status change to /i, // "Incident Status Change to PENDING ..."
  /probabilidad calculada por smbot/i, // SMBOT
  /^\s*node reset at /i, // "Node Reset at 10/11/2026 ..."
  /^\s*wizard used /i, // "Wizard Used Reassign Incidents"
];

function esNotaAutomatica(desc: string | undefined): boolean {
  const d = (desc ?? "").trim();
  if (!d) return true;
  return PATRONES_NOTA_AUTOMATICA.some((re) => re.test(d));
}

export function lineaEstatus(res: ImEstatusResult | undefined): string {
  if (!res) return "sin datos (no se consultó)";
  if (res.error) return "no se pudo consultar";
  if (!res.found) return "no encontrado en HPSM";
  if (res.cerrado) return "Cerrado";
  const acts = res.actividades ?? [];
  // Primera actividad (más reciente) que NO sea automática.
  const real = acts.find((a) => !esNotaAutomatica(a.descripcion))?.descripcion?.trim();
  if (real) return real;
  // Todas automáticas: cae a la más reciente para no quedar vacío.
  const ultima = acts[0]?.descripcion?.trim();
  if (ultima) return ultima;
  return res.status?.trim() || "(sin nota)";
}

export interface BuildMessageOptions {
  /** Etiqueta del cliente para el encabezado (ej. "SMART FIT" o "PEXA"). */
  etiquetaCliente?: string;
  /** Prefijo a recortar del Site Name en el texto (normalmente el nombre del cliente). */
  prefijoSitio: string;
  /** Instante del envío (para la fecha del encabezado). Default: ahora. */
  ahora?: Date;
}

/** Arma el bloque de un IM (número + IM + REF + Site Name + Estatus). */
function bloqueIm(
  it: ClienteTopItem,
  i: number,
  estatus: Map<string, ImEstatusResult>,
  prefijoSitio: string,
): string[] {
  return [
    "",
    `${emojiNumero(i)} *${it.incidentId}*`,
    `REF: ${it.ref}`,
    `Site Name: ${recortarSitio(it.siteName, prefijoSitio)}`,
    `Estatus: ${lineaEstatus(estatus.get(it.incidentId))}`,
  ];
}

/**
 * Arma el mensaje completo de WhatsApp, agrupado en "En gestión" (no resueltos)
 * y "Resueltos (por cerrar)". `items` son los IMs del cliente y `estatus` el
 * mapa incidentId → resultado del scraper. La numeración reinicia por grupo.
 */
export function buildClienteTopMessage(
  items: ClienteTopItem[],
  estatus: Map<string, ImEstatusResult>,
  opts: BuildMessageOptions,
): string {
  const etiqueta = (opts.etiquetaCliente ?? "PEXA").trim();
  const fecha = fechaEncabezado(opts.ahora ?? new Date());

  const enGestion = items.filter((it) => !isResolvedStatus(it.status));
  const resueltos = items.filter((it) => isResolvedStatus(it.status));

  const lineas: string[] = [`📊 *ESTATUS CLIENTE TOP · ${etiqueta}*`, fecha, ""];

  lineas.push(`🔴 *En gestión: ${enGestion.length}*`);
  enGestion.forEach((it, i) => lineas.push(...bloqueIm(it, i, estatus, opts.prefijoSitio)));

  if (resueltos.length > 0) {
    lineas.push("", `✅ *Resueltos (por cerrar): ${resueltos.length}*`);
    resueltos.forEach((it, i) => lineas.push(...bloqueIm(it, i, estatus, opts.prefijoSitio)));
  }

  return lineas.join("\n");
}
