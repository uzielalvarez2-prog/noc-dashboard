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

/**
 * Parsea el CSV completo carácter por carácter, respetando comillas dobles,
 * comas dentro de campos, y saltos de línea DENTRO de campos entrecomillados
 * (HPSM a veces pega salidas de ping multilínea en "Summary"). Dividir por
 * líneas antes de interpretar comillas —como hacía la versión anterior—
 * rompe esos campos y desalinea el resto del archivo.
 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cur += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
    } else if (ch === ",") {
      row.push(cur);
      cur = "";
      i++;
    } else if (ch === "\r") {
      i++; // ignorado; \n (propio o siguiente) cierra la fila
    } else if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      i++;
    } else {
      cur += ch;
      i++;
    }
  }
  // Última fila sin salto de línea final.
  if (cur !== "" || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

/** Convierte el CSV en filas indexadas por nombre de columna. */
export function parseCSV(text: string): Record<string, string>[] {
  const allRows = parseCsvRows(text).filter((r) => !(r.length === 1 && r[0].trim() === ""));
  if (allRows.length < 2) return [];
  const headers = allRows[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < allRows.length; i++) {
    const values = allRows[i];
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
