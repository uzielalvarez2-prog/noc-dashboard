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

// Item para la tabla de EDC → Escalados: mismo formato que la tabla original de
// EDC (StatusCardItem). La LISTA son los incidentes que llegan por WhatsApp; de
// WhatsApp solo se toma el incidentId y el resto de datos sale de abiertos
// (OpenIncident). La nota/bandera se reutiliza de EscalatedIncident (no hay
// almacenamiento nuevo).
export interface EdcEscaladoItem {
  incidentId: string;
  openTime: string | null;
  status: string;
  company: string;
  serviceId: string;
  state: string;
  district: string;
  assignee: string | null;
  flagged: boolean;
  note: string;
}

export async function getEdcEscaladoItems(): Promise<EdcEscaladoItem[]> {
  const reports = await db.edcReport.findMany({ select: { incidentId: true } });
  const ids = reports
    .map((r) => r.incidentId)
    .filter((id) => !id.startsWith("IMCARE"));
  if (ids.length === 0) return [];

  const [openRows, marks] = await Promise.all([
    db.openIncident.findMany({
      where: { incidentId: { in: ids } },
      select: {
        incidentId: true,
        openTime: true,
        status: true,
        company: true,
        serviceId: true,
        state: true,
        district: true,
        assignee: true,
      },
    }),
    db.escalatedIncident.findMany({
      where: { incidentId: { in: ids } },
      select: { incidentId: true, flagged: true, note: true },
    }),
  ]);

  // 1 fila por incidente (abarca varios sitios) y mapa de marcas.
  const byId = new Map<string, (typeof openRows)[number]>();
  for (const r of openRows) if (!byId.has(r.incidentId)) byId.set(r.incidentId, r);
  const markById = new Map(marks.map((m) => [m.incidentId, m]));

  const out: EdcEscaladoItem[] = [];
  for (const id of ids) {
    const live = byId.get(id);
    if (!live) continue; // no está en abiertos → no se muestra (igual que la vista WhatsApp)
    const mark = markById.get(id);
    out.push({
      incidentId: id,
      openTime: live.openTime?.toISOString() ?? null,
      status: live.status,
      company: live.company,
      serviceId: live.serviceId,
      state: live.state,
      district: live.district,
      assignee: live.assignee,
      flagged: mark?.flagged ?? false,
      note: mark?.note ?? "",
    });
  }
  return out;
}
