import { db } from "@/lib/db";

export interface ActiveEdcReport {
  incidentId: string;
  rawText: string;
  sentAt: Date;
}

/**
 * Reportes de WhatsApp vigentes para la pestaña EDC.
 *
 * Solo devuelve los reportes cuyo IM sigue en el snapshot de ABIERTOS
 * (`OpenIncident`, que el scraper reemplaza cada pocos minutos). Cuando el IM se
 * resuelve y desaparece del snapshot, su reporte deja de mostrarse — sin
 * histórico, tal como se acordó. Orden: el mensaje más reciente primero.
 */
export async function getActiveEdcReports(): Promise<ActiveEdcReport[]> {
  const [reports, openIds] = await Promise.all([
    db.edcReport.findMany({
      orderBy: { sentAt: "desc" },
      select: { incidentId: true, rawText: true, sentAt: true },
    }),
    db.openIncident.findMany({
      select: { incidentId: true },
      distinct: ["incidentId"],
    }),
  ]);

  // CARE (IMCARE...) no es de PEXA: no se muestra aunque quedara alguno en la DB.
  const open = new Set(openIds.map((o) => o.incidentId));
  return reports.filter((r) => open.has(r.incidentId) && !r.incidentId.startsWith("IMCARE"));
}
