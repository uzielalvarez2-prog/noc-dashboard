// Utilidades compartidas para procesar los exports CSV de HPSM.
// Dos formatos distintos conviven (abiertos vs cerrados); esto los unifica.

export const ACTIVE_GROUPS = ["PEXA", "CECOR"] as const;
export type ActiveGroup = (typeof ACTIVE_GROUPS)[number];

/** SLA objetivo: 4 horas. Más allá de eso, el incidente cuenta como vencido. */
export const SLA_MINUTES = 240;

export function isActiveGroup(g: string): g is ActiveGroup {
  return (ACTIVE_GROUPS as readonly string[]).includes(g);
}

/**
 * Decodifica el archivo respetando su codificación real. Los exports de HPSM
 * vienen en Windows-1252 (la Ñ y los acentos se rompen si se leen como UTF-8),
 * pero toleramos UTF-8 por si algún día cambia.
 */
export function decodeCsvBuffer(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  // El carácter de reemplazo indica que los bytes no eran UTF-8 válido.
  if (utf8.includes("�")) {
    return new TextDecoder("windows-1252").decode(buf);
  }
  return utf8;
}

/** Separa una línea CSV respetando comillas dobles y comas dentro de campos. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (ch === '"') {
      if (inQuotes && line[j + 1] === '"') {
        cur += '"';
        j++; // comilla escapada ("")
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Convierte el CSV en filas indexadas por nombre de columna. */
export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Parsea las fechas de HPSM en sus DOS formatos reales:
 *   - Abiertos: "YY/MM/DD HH:MM:SS"  (ej. 26/06/04 21:53:47)
 *   - Cerrados: "YYYY-MM-DD H:MM"     (ej. 2026-06-04 7:35)
 *
 * Interpretamos la hora como "reloj de pared" y la guardamos en UTC para que
 * los números no se recorran según la zona horaria del servidor (Vercel corre
 * en UTC) ni del navegador. Para mostrar, se formatea siempre en UTC.
 */
export function parseHpsmDate(s: string): Date | null {
  if (!s) return null;
  const v = s.trim();

  // Cerrados: con guiones y año de 4 dígitos.
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0));
  }
  // Abiertos: con diagonales y año de 2 dígitos.
  m = v.match(/^(\d{2})\/(\d{1,2})\/(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    return new Date(Date.UTC(2000 + +m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0));
  }
  // Último recurso: parser nativo.
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Encuentra el nombre real de una columna a partir de candidatos. Primero busca
 * coincidencia exacta (sin distinguir mayúsculas); si no, que el encabezado
 * contenga todas las palabras del candidato. Cubre variaciones menores de HPSM.
 */
export function pickCol(headers: string[], candidates: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx >= 0) return headers[idx];
  }
  for (const c of candidates) {
    const words = c.toLowerCase().split(/\s+/);
    const idx = lower.findIndex((h) => words.every((w) => h.includes(w)));
    if (idx >= 0) return headers[idx];
  }
  return null;
}
