import { db } from "@/lib/db";

export interface ActiveEdcReport {
  incidentId: string;
  rawText: string;
  sentAt: Date;
  status: string; // estatus HPSM del incidente en la tabla de abiertos (OpenIncident)
}

/**
 * Reportes de WhatsApp vigentes para la pestaña EDC.
 *
 * Solo devuelve los reportes cuyo IM sigue en el snapshot de ABIERTOS
 * (`OpenIncident`, que el scraper reemplaza cada pocos minutos) y adjunta su
 * `status` HPSM real — de ahí sale el color de la tarjeta (RESOLVED=verde,
 * WORK IN PROGRESS=ámbar, resto=rojo), NO del texto de WhatsApp. Cuando el IM se
 * cierra y desaparece del snapshot, su reporte deja de mostrarse. Los CARE
 * (IMCARE...) no son de PEXA: se excluyen. Orden: mensaje más reciente primero.
 */
export async function getActiveEdcReports(): Promise<ActiveEdcReport[]> {
  const [reports, openRows] = await Promise.all([
    db.edcReport.findMany({
      orderBy: { sentAt: "desc" },
      select: { incidentId: true, rawText: true, sentAt: true },
    }),
    db.openIncident.findMany({
      select: { incidentId: true, status: true },
    }),
  ]);

  // OpenIncident tiene 1 fila por sitio; el status es del incidente (igual en
  // todas). Map incidentId → status (la primera fila basta).
  const statusById = new Map<string, string>();
  for (const o of openRows) {
    if (!statusById.has(o.incidentId)) statusById.set(o.incidentId, o.status);
  }

  return reports
    .filter((r) => statusById.has(r.incidentId) && !r.incidentId.startsWith("IMCARE"))
    .map((r) => ({ ...r, status: statusById.get(r.incidentId) ?? "" }));
}
