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
  district: string; // Distrito (viene de Abiertos) — se pega al CASE en el Ticket
  serviceId: string; // Servicio (viene de Abiertos) — referencia en "Servicio afectado"
  openTime: string | Date; // Apertura (viene de Abiertos)
}

// SOLO para el formato EDC: Monterrey → Mty, Guadalajara → Gdl.
// En la columna CASE de la tabla se dejan completos (no se toca aquí).
export function abreviarCaseEdc(caseVal: string): string {
  return (caseVal ?? "")
    .replace(/Guadalajara/gi, "Gdl")
    .replace(/Monterrey/gi, "Mty");
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

// Tipo de servicio según el prefijo del folio (columna Servicio de Abiertos):
// numérico -> IDN, empieza con C/T/A -> IDE, empieza con D -> VPN.
// Ejemplos: "5521240618" -> IDN; "A32-1705-004", "TCB-2109-0003-C02-2111-0156" -> IDE;
// "D04-1601-0001" -> VPN.
export function tipoServicioEdc(serviceId: string): "IDN" | "IDE" | "VPN" | null {
  const s = (serviceId ?? "").trim();
  if (!s) return null;
  if (/^\d/.test(s)) return "IDN";
  if (/^[CTA]/i.test(s)) return "IDE";
  if (/^D/i.test(s)) return "VPN";
  return null;
}

// Texto en el formato que el equipo publica en el grupo STAFF SUPERVISIÓN.
// Pre-llena lo que SISA + Abiertos ya tienen; deja en blanco lo que es manual
// por incidente (Alto impacto, Estatus) para completar antes de enviar.
export function buildEdcText(it: SisaEdcInput): string {
  // Ticket: "{folio SISA} | CASE {CASE abreviado}-{Distrito}".
  // El campo vendor a veces ya trae el prefijo "CASE" — se quita para no duplicarlo.
  const rawCase = (it.vendor ?? "").trim().replace(/^CASE\s+/i, "");
  const caseAbbr = abreviarCaseEdc(rawCase);
  const district = (it.district ?? "").trim();
  const caseLabel = [caseAbbr, district].filter(Boolean).join("-");
  const ticketLine = caseLabel
    ? `Ticket: ${it.vendorTicket} | CASE ${caseLabel}`
    : `Ticket: ${it.vendorTicket}`;
  // "Servicio afectado": tipo resuelto por prefijo (IDN/IDE/VPN) seguido de la
  // referencia real del servicio (viene de la columna Servicio / serviceId).
  const servicio = (it.serviceId ?? "").trim();
  const tipo = tipoServicioEdc(servicio);
  const servicioLine = servicio
    ? `Servicio afectado: ${tipo ?? "IDN | VPN | IDE"} ${servicio}`
    : `Servicio afectado: IDN | VPN | IDE`;
  // "Alto impacto" y "Estatus" traen opciones por defecto (separadas por " | ")
  // que se depuran a mano antes de enviar al grupo.
  return [
    `*Incidente crítico:* ${it.incidentId}`,
    `Cliente: *${it.company || ""}*`,
    `Alto impacto: Sin respaldo`,
    servicioLine,
    ticketLine,
    `Inicio: ${formatInicioEdc(it.openTime)}`,
    `Estatus: ONT fuera de gestión | Demarcador fuera de gestión`,
  ].join("\n");
}
