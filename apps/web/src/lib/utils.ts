import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Mexico_City",
  }).format(new Date(date));
}

/**
 * Formatea las fechas de HPSM. Las guardamos como "reloj de pared" en UTC, así
 * que SE FORMATEAN EN UTC para mostrar exactamente los números del CSV original
 * (si usáramos zona de México se recorrerían 6 horas).
 */
export function formatHpsm(date: Date | string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(date));
}

/**
 * Formato para los archivos Excel/CSV que se descargan: "aaaa/mm/dd hh:mm".
 * Se arma con formatToParts para forzar el orden año/mes/día sin importar locale.
 */
function formatYmdHm(date: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(new Date(date));
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${p("year")}/${p("month")}/${p("day")} ${p("hour")}:${p("minute")}`;
}

/** Fechas HPSM (reloj de pared en UTC) para exportes: aaaa/mm/dd hh:mm. */
export function formatHpsmExcel(date: Date | string): string {
  return formatYmdHm(date, "UTC");
}

/** Timestamps reales de DB para exportes: aaaa/mm/dd hh:mm en hora de México. */
export function formatDateExcel(date: Date | string): string {
  return formatYmdHm(date, "America/Mexico_City");
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const target = new Date(date);
  const diffMs = now.getTime() - target.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Ahora";
  if (diffMins < 60) return `Hace ${diffMins}m`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  return `Hace ${diffDays}d`;
}

export function formatSlaRemaining(deadline: Date | string): {
  label: string;
  color: "critical" | "warning" | "muted";
} {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms < 0) return { label: "Vencido", color: "critical" };
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  let label = "";
  if (days > 0) label = `${days}d ${hours % 24}h`;
  else if (hours > 0) label = `${hours}h ${mins % 60}m`;
  else label = `${mins}m`;
  const color = mins < 120 ? "critical" : mins < 480 ? "warning" : "muted";
  return { label, color };
}

export function getSlaRemainingPercent(
  deadline: Date | string,
  createdAt: Date | string
): number {
  const now = new Date();
  const end = new Date(deadline);
  const start = new Date(createdAt);
  const total = end.getTime() - start.getTime();
  const remaining = end.getTime() - now.getTime();
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (remaining / total) * 100));
}
