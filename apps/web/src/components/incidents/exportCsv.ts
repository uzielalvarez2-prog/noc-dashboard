import type { Incident } from "@/types";

const SEV_LABELS: Record<string, string> = {
  CRITICAL: "CRÍTICO",
  HIGH: "ALTO",
  MEDIUM: "MEDIO",
  LOW: "BAJO",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En progreso",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};

function fmt(d: Date | string) {
  return new Date(d).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function exportIncidentsCSV(incidents: Incident[]) {
  const headers = [
    "Incident ID",
    "Título",
    "Severidad",
    "Estado",
    "Asignado",
    "SLA Deadline",
    "SLA Vencido",
    "Creado",
    "Actualizado",
    "Fuente",
  ];

  const rows = incidents.map((inc) => [
    inc.id,
    `"${inc.title.replace(/"/g, '""')}"`,
    SEV_LABELS[inc.severity] ?? inc.severity,
    STATUS_LABELS[inc.status] ?? inc.status,
    inc.assignedTo ?? "",
    fmt(inc.slaDeadline),
    inc.slaBreached ? "Sí" : "No",
    fmt(inc.createdAt),
    fmt(inc.updatedAt),
    inc.source,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `incidentes_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
