// SISA: tickets del vendor (export "Vendor Ticket" de HPSM).
// El "Id" del CSV viene como IM4CH000897-001; el incidente real es el prefijo
// antes del guion: IM4CH000897.
export function incidentIdFromSisaRow(id: string): string {
  return id.trim().split("-")[0].trim();
}

// El "Vendor Ticket" suele traer basura pegada con tabs: un código, una fecha y
// texto (ej. "12429001\tC02-2307-0056\t05/07/26 18:39:53\tCASMEX"). Otros traen
// prefijos como "SISA 12099606" o folios con guion como "1244-3051".
//
// Limpieza: primero quitamos los guiones (para que "1244-3051" quede "12443051",
// el folio SISA completo) y luego tomamos la PRIMERA secuencia de dígitos. Si no
// hay dígitos (ej. "N/A"), devolvemos el texto original recortado.
export function cleanVendorTicket(raw: string): string {
  const text = (raw ?? "").replace(/-/g, "");
  const m = text.match(/\d+/);
  return m ? m[0] : (raw ?? "").trim();
}

// Datos que necesita el "Formato EDC" de una fila SISA.
export interface SisaEdcInput {
  incidentId: string;
  company: string; // Empresa/Cliente (viene de Abiertos/PEXA, cruzado por IM)
  vendorTicket: string; // folio SISA
  vendor: string; // CASE
  openTime: string | Date; // Apertura (viene de Abiertos)
}

const MESES_EDC = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// "24/Jul/2026, 14:00 horas". openTime es el reloj de pared de HPSM guardado
// como UTC, así que se formatea en UTC (igual criterio que formatHpsm).
export function formatInicioEdc(date: string | Date): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mmm = MESES_EDC[d.getUTCMonth()];
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mmm}/${yyyy}, ${hh}:${mi} horas`;
}

// Texto en el formato que el equipo publica en el grupo STAFF SUPERVISIÓN.
// Pre-llena lo que SISA + Abiertos ya tienen; deja en blanco lo que es manual
// por incidente (Alto impacto, Estatus) para completar antes de enviar.
export function buildEdcText(it: SisaEdcInput): string {
  const caseVal = (it.vendor ?? "").trim();
  const ticketLine = caseVal
    ? `Ticket: ${it.vendorTicket} | CASE ${caseVal}`
    : `Ticket: ${it.vendorTicket}`;
  // "Alto impacto", "Servicio afectado" y "Estatus" quedan en blanco a propósito:
  // son detalle manual por incidente que se completa antes de enviar al grupo.
  return [
    `*Incidente crítico:* ${it.incidentId}`,
    `Cliente: *${it.company || ""}*`,
    `Alto impacto: `,
    `Servicio afectado: `,
    ticketLine,
    `Inicio: ${formatInicioEdc(it.openTime)}`,
    `Estatus: `,
  ].join("\n");
}
