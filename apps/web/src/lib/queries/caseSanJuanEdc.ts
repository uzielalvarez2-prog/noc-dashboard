import { db } from "@/lib/db";

// El CASE San Juan a veces NO alcanza a generar la tarea SISA de un incidente,
// pero el grupo de WhatsApp (EDC) sí lo reporta con "CASE San Juan" en la línea
// "Ticket:". Esos IMs no tienen SisaTicket del vendor, así que no entran por el
// cruce normal de /api/case-san-juan. Este helper los rescata desde EdcReport.
//
// Criterio (igual que lo ve el usuario en la tarjeta de EDC): la línea que
// empieza con "Ticket:" menciona "CASE San Juan" (en cualquier grafía/espaciado:
// "CASE SAN JUAN", "CASE  SAN JUAN", "CASE San Juan - *ALCALDÍA*"…).
//
// Matchea solo dentro de la línea del Ticket para no confundirse con menciones
// de "San Juan" en el nombre del sitio o del cliente.
const TICKET_SAN_JUAN_RE = /^[^\S\r\n]*ticket\s*:[^\n]*case\s*san\s*juan/im;

/** ¿El reporte de WhatsApp (EDC) marca este incidente como CASE San Juan? */
export function edcRawTextEsSanJuan(rawText: string): boolean {
  return TICKET_SAN_JUAN_RE.test(rawText);
}

/**
 * IncidentIds que hoy están en la vista EDC del dashboard marcados como
 * "CASE San Juan" en su línea Ticket. Excluye IMCARE (no son de PEXA, igual que
 * el resto de EDC). No filtra por "sigue abierto" ni por SisaTicket: de eso se
 * encarga quien consume (el route cruza contra OpenIncident y SisaTicket).
 */
export async function getEdcSanJuanIncidentIds(): Promise<Set<string>> {
  const reports = await db.edcReport.findMany({
    select: { incidentId: true, rawText: true },
  });
  const ids = new Set<string>();
  for (const r of reports) {
    if (r.incidentId.startsWith("IMCARE")) continue;
    if (edcRawTextEsSanJuan(r.rawText)) ids.add(r.incidentId);
  }
  return ids;
}
