import type { Incident } from "@/types";
import { downloadXLSX } from "@/lib/excelExport";

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
    inc.title,
    SEV_LABELS[inc.severity] ?? inc.severity,
    STATUS_LABELS[inc.status] ?? inc.status,
    inc.assignedTo ?? "",
    fmt(inc.slaDeadline),
    inc.slaBreached ? "Sí" : "No",
    fmt(inc.createdAt),
    fmt(inc.updatedAt),
    inc.source,
  ]);

  downloadXLSX(
    `incidentes_${new Date().toISOString().slice(0, 10)}.xlsx`,
    "Incidentes",
    headers,
    rows,
  );
}
