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
