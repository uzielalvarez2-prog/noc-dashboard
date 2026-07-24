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
