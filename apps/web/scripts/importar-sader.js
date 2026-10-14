// Importa el directorio de contactos SADER a la tabla SaderContacto.
//
// Fuente: el Excel "Informaticos SADER COMPLETO_Ref-SiteID.xlsx", hoja
// "DIRECTORIO GENERAL". Ejecutar desde apps/web:  node scripts/importar-sader.js
// Ruta del Excel: variable SADER_XLSX o la ruta por defecto en G:\.
//
// Columnas (encabezados en la fila 1, datos desde la fila 2):
//   E = Referencia (llave de cruce con el REF del incidente)
//   D = Sitio (NOMBRE DE SITIO)
//   O = Contacto (INFORMATICO; puede traer varios nombres en saltos de línea)
//   P = Teléfono (TELÉFONO INFORMATICO)
//   Q = Extensión (Ext. Red AGRICULTURA) — se anexa como "ext. XXXX"
//   R = Correo(s) (CORREO ELECTRÓNICO; uno o varios, separados por saltos de línea)
//
// Reemplaza TODA la tabla por lo que haya en el Excel (deleteMany + createMany):
// el Excel es la fuente de verdad.

const { existsSync } = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");

// Carga el env con dotenv (tolera el BOM de .env, a diferencia de loadEnvFile).
require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL no definido. Ejecuta desde apps/web (donde está .env).");
  process.exit(1);
}
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const XLSX_PATH =
  process.env.SADER_XLSX ||
  "G:/Mi unidad/CARE/Clientes_CARE/Informaticos SADER COMPLETO_Ref-SiteID.xlsx";

const SHEET_NAME = "DIRECTORIO GENERAL"; // hoja a leer (la 1ª si no existe por nombre)
const HEADER_ROW = 1; // fila de encabezados; los datos empiezan en la siguiente

/** Celda a texto limpio (exceljs puede devolver objetos para rich text / fórmulas). */
function cellText(cell) {
  const v = cell && cell.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if (typeof v.text === "string") return v.text;
    if (typeof v.result !== "undefined") return String(v.result);
    return String(v);
  }
  return String(v);
}

/** Solo dígitos: la Referencia del Excel y el REF del incidente traen formatos distintos. */
function soloDigitos(s) {
  return (s || "").replace(/\D/g, "");
}

/** Col I → lista de correos: separa por saltos de línea, comas y ';'; descarta lo que no sea correo. */
function parseCorreos(raw) {
  return (raw || "")
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => /@/.test(s));
}

(async () => {
  if (!existsSync(XLSX_PATH)) {
    console.error(`No se encontró el Excel: ${XLSX_PATH}`);
    console.error("Pasa la ruta con la variable SADER_XLSX si está en otro lado.");
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);
  const ws = wb.getWorksheet(SHEET_NAME) || wb.worksheets[0];
  console.log(`Leyendo "${path.basename(XLSX_PATH)}" → hoja "${ws.name}" (${ws.rowCount} filas)`);

  const porRef = new Map();
  let sinRef = 0;

  for (let r = HEADER_ROW + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const referencia = soloDigitos(cellText(row.getCell("E")));
    const sitio = cellText(row.getCell("D")).trim();
    if (!referencia && !sitio) continue; // fila vacía
    if (!referencia) {
      sinRef++;
      continue; // sin llave de cruce: no sirve (cae al formato básico de HPSM)
    }
    // Teléfono + extensión juntos: "55 3584 9879 ext. 40502".
    const tel = cellText(row.getCell("P")).trim().replace(/\s+/g, " ");
    const ext = cellText(row.getCell("Q")).trim();
    const telefono = tel + (ext ? `${tel ? " " : ""}ext. ${ext}` : "");
    porRef.set(referencia, {
      referencia,
      sitio,
      contacto: cellText(row.getCell("O")).trim(),
      telefono,
      correos: parseCorreos(cellText(row.getCell("R"))),
    });
  }

  const data = [...porRef.values()];
  if (data.length === 0) {
    console.error("No se encontró ninguna fila con Referencia. ¿Cambió el formato del Excel?");
    process.exit(1);
  }

  // Reemplazo total: el Excel manda.
  await db.$transaction([
    db.saderContacto.deleteMany({}),
    db.saderContacto.createMany({ data }),
  ]);

  console.log(`✔ Importados ${data.length} contactos SADER.` + (sinRef ? ` (${sinRef} fila(s) sin Referencia, omitidas)` : ""));
  console.log("Ejemplos:");
  for (const c of data.slice(0, 3)) {
    console.log(`  ${c.referencia} | ${c.sitio} | ${c.correos.join(", ") || "(sin correo)"}`);
  }

  await db.$disconnect();
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
