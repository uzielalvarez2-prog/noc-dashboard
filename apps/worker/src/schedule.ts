import { config } from "./config.js";

/** Convierte "HH:MM" a minutos desde medianoche. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Hora local (minutos desde medianoche) en la zona horaria configurada. */
function nowMinutesInTz(tz: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // Intl puede devolver "24" a medianoche en algunos entornos; normalizar.
  return (hour % 24) * 60 + minute;
}

/**
 * Indica si el worker está en la ventana de pausa nocturna.
 * La ventana puede cruzar medianoche (p.ej. 23:30 → 05:55).
 */
export function isPaused(now: Date = new Date()): boolean {
  const { timezone, pauseStart, pauseEnd } = config.schedule;
  const current = nowMinutesInTz(timezone, now);
  const start = toMinutes(pauseStart);
  const end = toMinutes(pauseEnd);

  if (start === end) return false; // sin ventana de pausa
  if (start > end) return current >= start || current < end; // cruza medianoche
  return current >= start && current < end; // mismo día
}
