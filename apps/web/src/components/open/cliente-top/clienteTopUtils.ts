// Tipos y helpers compartidos del tablero Cliente TOP (lista, resumen y ficha).
// Sin imports de servidor: esto se carga en el navegador.

export interface ClienteTopIncidente {
  incidentId: string;
  /** ISO — la edad se calcula en el cliente para que no dependa del refetch. */
  openTime: string;
  status: string;
  resolved: boolean;
  serviceId: string;
  siteName: string;
  states: string[];
  assignee: string | null;
}

export interface ClienteTopStat {
  id: string;
  company: string;
  /** Nombre corto a mostrar en la tarjeta (alias); igual a company si no se definió uno. */
  displayName: string;
  siglasIm: string;
  serviceRef: string;
  note: string | null;
  openCount: number;
  /** IM's aún no resueltos (los RESOLVED siguen en el snapshot hasta el cierre). */
  activeCount: number;
  criticalCount: number;
  /** Edad en ms de cada incidente que ya superó el SLA de 4h, sin resolver. */
  delayedMs: number[];
  incidentes: ClienteTopIncidente[];
}

/** SLA de dilación: mismo umbral de 4h que el resto del dashboard. */
export const SLA_MS = 4 * 3_600_000;

/** "1d 4h" / "4h" — se trunca a horas (no se baja a minutos: el SLA es de 4h). */
export function formatDilacion(ms: number): string {
  const totalHours = Math.floor(ms / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  return `${hours}h`;
}

/** Edad con minutos para IM's recientes: "6d 1h" / "3h 20m" / "45m". */
export function formatEdad(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

/** Agrupa las dilaciones iguales: "1 con dilación de 1d 4h", "1 con dilación de 4h". */
export function describirDilaciones(delayedMs: number[]): string[] {
  const counts = new Map<string, { count: number; ms: number }>();
  for (const ms of delayedMs) {
    const label = formatDilacion(ms);
    const prev = counts.get(label);
    counts.set(label, { count: (prev?.count ?? 0) + 1, ms });
  }
  // Dilación más grave (mayor) primero.
  return [...counts.entries()]
    .sort((a, b) => b[1].ms - a[1].ms)
    .map(([label, { count }]) => `${count} con dilación de ${label}`);
}

/** Dilación máxima del cliente (0 si no tiene ninguno vencido). */
export function maxDilacion(c: ClienteTopStat): number {
  return c.delayedMs.length > 0 ? Math.max(...c.delayedMs) : 0;
}

// Semáforo del cliente:
//   critical = al menos 1 IM activo con dilación >4h
//   warning  = tiene IM's activos (sin resolver) pero ninguno pasó las 4h
//   success  = tiene IM's pero TODOS están en RESOLVED (nada en gestión)
//   muted    = no tiene ningún IM en el snapshot
export type Severity = "critical" | "warning" | "success" | "muted";

export function severityOf(c: ClienteTopStat): Severity {
  if (c.delayedMs.length > 0) return "critical";
  if (c.activeCount > 0) return "warning";
  if (c.openCount > 0) return "success";
  return "muted";
}

// Clases por severidad: línea + punto con glow (lollipop) y texto. El rojo va más
// tenue (opacidad + glow suave) que los demás.
export const SEV: Record<
  Severity,
  { text: string; track: string; dot: string }
> = {
  critical: {
    text: "text-critical/80",
    track: "bg-critical/40",
    dot: "bg-critical/75 shadow-[0_0_7px_1px_rgba(239,68,68,0.3)]",
  },
  warning: {
    text: "text-warning",
    track: "bg-warning/60",
    dot: "bg-warning shadow-[0_0_8px_2px_rgba(245,158,11,0.5)]",
  },
  success: {
    text: "text-success",
    track: "bg-success/60",
    dot: "bg-success shadow-[0_0_7px_2px_rgba(34,197,94,0.45)]",
  },
  muted: {
    text: "text-text-muted",
    track: "bg-text-muted/20",
    dot: "bg-text-muted/40",
  },
};

/** Edad a la que el color llega a rojo pleno: ámbar al pasar el SLA (4h) → rojo a las 24h. */
export const RED_MS = 24 * 3_600_000;

type Rgb = readonly [number, number, number];
const GREEN: Rgb = [34, 197, 94];
const AMBER: Rgb = [245, 158, 11];
const RED: Rgb = [239, 68, 68];

function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

/**
 * Color de un IM según su edad: verde dentro del SLA; al pasarlo arranca en ámbar y
 * se va tornando a rojo hasta RED_MS. Sirve para la barra de antigüedad y su texto.
 */
export function ageColor(ms: number, alpha = 1): string {
  if (ms <= SLA_MS) return rgba(GREEN, alpha);
  const t = Math.min(1, (ms - SLA_MS) / (RED_MS - SLA_MS));
  return rgba(
    [AMBER[0] + (RED[0] - AMBER[0]) * t, AMBER[1] + (RED[1] - AMBER[1]) * t, AMBER[2] + (RED[2] - AMBER[2]) * t],
    alpha,
  );
}

export type SortKey = "gravedad" | "ims" | "nombre";

export const SORT_LABELS: Record<SortKey, string> = {
  gravedad: "Gravedad",
  ims: "Más IM's",
  nombre: "Nombre A–Z",
};

/** Sin acentos ni mayúsculas, para comparar búsquedas. */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function sortClientes(list: ClienteTopStat[], key: SortKey): ClienteTopStat[] {
  const byName = (a: ClienteTopStat, b: ClienteTopStat) =>
    a.displayName.localeCompare(b.displayName, "es");
  return list.slice().sort((a, b) => {
    if (key === "nombre") return byName(a, b);
    if (key === "ims") return b.openCount - a.openCount || maxDilacion(b) - maxDilacion(a) || byName(a, b);
    // Más grave primero: mayor dilación, luego más IM's abiertos, luego alfabético.
    return maxDilacion(b) - maxDilacion(a) || b.openCount - a.openCount || byName(a, b);
  });
}

/** Texto de un IM contra el que se busca: ID, servicio, sitio y estados. */
function incidenteHaystack(i: ClienteTopIncidente): string {
  return norm([i.incidentId, i.serviceId, i.siteName, ...i.states].join(" "));
}

/** ¿El cliente coincide con la búsqueda (q ya normalizada) por nombre, alias o por alguno de sus IM's? */
export function matchesQuery(c: ClienteTopStat, q: string): boolean {
  if (!q) return true;
  return (
    norm(c.displayName).includes(q) ||
    norm(c.company).includes(q) ||
    c.incidentes.some((i) => incidenteHaystack(i).includes(q))
  );
}

/**
 * Si el cliente apareció por un IM (y no por su nombre), devuelve una línea corta
 * para mostrar POR QUÉ salió en la lista, ej. "IMWTPT000624 · Sucursal Centro".
 */
export function matchHint(c: ClienteTopStat, q: string): string | null {
  if (!q || norm(c.displayName).includes(q) || norm(c.company).includes(q)) return null;
  const hit = c.incidentes.find((i) => incidenteHaystack(i).includes(q));
  if (!hit) return null;
  return [hit.incidentId, hit.siteName || hit.serviceId].filter(Boolean).join(" · ");
}
