// Importa el padrón y los horarios base del equipo a las tablas Colaborador /
// HorarioBase. Ejecutar desde apps/web:  node scripts/importar-horarios.js
//
// Fuentes (variables de entorno para sobreescribir rutas):
//   HORARIOS_VESP = "H_Vespertino.xlsx"  → Hoja1 = Matutino, Hoja2 = Vespertino
//   HORARIOS_CECOR = "Horarios_CECOR.xlsx" → hoja única = CECOR
//
// Formato esperado (igual que el Excel real del usuario):
//   Matutino/Vespertino: encabezados en la fila 4 (B=Nombre, C=Usuario,
//     D..J = Domingo..Sábado), datos desde la fila 5 hasta "PERSONAL TRABAJANDO".
//   CECOR: encabezados en la fila 4 (A=Nombre, B..H = Lunes..Domingo),
//     datos desde la fila 5.
//
// Reemplaza TODO el padrón por lo que haya en los Excel (el Excel es la fuente
// de verdad). Los AsistenciaEvento NO se tocan si el colaborador se reconoce por
// nombre; si cambia de nombre, se crea uno nuevo (sus eventos viejos quedan).
//
// NO imprime credenciales. Lee DATABASE_URL de .env / .env.local.

const { existsSync } = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");

require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: ".env.local", override: true });
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL no definido. Ejecuta desde apps/web (donde está .env).");
  process.exit(1);
}
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const BASE_DIR = process.env.HORARIOS_DIR || "G:/Mi unidad/CARE/Horarios T_Vespertino";
const VESP_XLSX = process.env.HORARIOS_VESP || path.join(BASE_DIR, "H_Vespertino.xlsx");
const CECOR_XLSX = process.env.HORARIOS_CECOR || path.join(BASE_DIR, "Horarios_CECOR.xlsx");

// Mapa de nombre de columna → índice de día (0=Dom..6=Sab).
const DIA_INDEX = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  "miércoles": 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  "sábado": 6,
};

function cellText(cell) {
  const v = cell && cell.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if (typeof v.text === "string") return v.text;
    if (typeof v.result !== "undefined") return String(v.result);
    return String(v);
  }
  return String(v).trim();
}

function normDiaHeader(s) {
  return s.toLowerCase().trim().normalize("NFC");
}

/**
 * Lee una hoja y devuelve [{nombre, usuario, grupo, horarios:{dia:horario}}].
 * headerRow = fila de encabezados; nameCol = letra de la columna de nombre;
 * userCol = letra de usuario (o null si la hoja no la trae, como CECOR).
 */
function leerHoja(ws, { headerRow, grupo }) {
  // Mapea cada columna de día a su índice leyendo la fila de encabezados.
  const header = ws.getRow(headerRow);
  const diaCols = {}; // colNumber → diaIndex
  let nameCol = null;
  let userCol = null;
  header.eachCell((cell, colNumber) => {
    const txt = normDiaHeader(cellText(cell));
    if (txt === "nombre") nameCol = colNumber;
    else if (txt === "usuario") userCol = colNumber;
    else if (txt in DIA_INDEX) diaCols[colNumber] = DIA_INDEX[txt];
  });
  if (nameCol == null) {
    throw new Error(`Hoja "${ws.name}": no encontré la columna "Nombre" en la fila ${headerRow}`);
  }

  const personas = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const nombre = cellText(row.getCell(nameCol));
    if (!nombre) continue;
    // Corta en las filas de leyenda/totales.
    const upper = nombre.toUpperCase();
    if (upper.includes("PERSONAL TRABAJANDO") || upper === "LEYENDA" || upper.includes("TOTAL")) {
      break;
    }
    const usuario = userCol ? cellText(row.getCell(userCol)) : "";
    const horarios = {};
    for (const [colNumber, diaIndex] of Object.entries(diaCols)) {
      const h = cellText(row.getCell(Number(colNumber)));
      if (h) horarios[diaIndex] = h.replace(/\s+/g, " ").trim();
    }
    personas.push({ nombre: nombre.replace(/\s+/g, " ").trim(), usuario, grupo, horarios });
  }
  return personas;
}

(async () => {
  const todos = [];

  if (existsSync(VESP_XLSX)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(VESP_XLSX);
    // Hoja1 = Matutino, Hoja2 = Vespertino (según el archivo real).
    const [h1, h2] = wb.worksheets;
    if (h1) todos.push(...leerHoja(h1, { headerRow: 4, grupo: "Matutino" }));
    if (h2) todos.push(...leerHoja(h2, { headerRow: 4, grupo: "Vespertino" }));
    console.log(`Leído ${path.basename(VESP_XLSX)}: Matutino + Vespertino`);
  } else {
    console.warn(`Aviso: no existe ${VESP_XLSX} — se omite Matutino/Vespertino.`);
  }

  if (existsSync(CECOR_XLSX)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(CECOR_XLSX);
    const ws = wb.worksheets[0];
    if (ws) todos.push(...leerHoja(ws, { headerRow: 4, grupo: "CECOR" }));
    console.log(`Leído ${path.basename(CECOR_XLSX)}: CECOR`);
  } else {
    console.warn(`Aviso: no existe ${CECOR_XLSX} — se omite CECOR.`);
  }

  if (todos.length === 0) {
    console.error("No se leyó ningún colaborador. Revisa las rutas de los Excel.");
    process.exit(1);
  }

  console.log(`\nTotal de colaboradores leídos: ${todos.length}`);
  const porGrupo = todos.reduce((acc, p) => ((acc[p.grupo] = (acc[p.grupo] || 0) + 1), acc), {});
  console.log("Por grupo:", porGrupo);

  // Reconcilia por nombre: actualiza horarios de los existentes, crea los nuevos,
  // desactiva los que ya no están en el Excel (sin borrar, para conservar eventos).
  const existentes = await db.colaborador.findMany();
  const porNombre = new Map(existentes.map((c) => [c.nombre.toLowerCase(), c]));
  const vistos = new Set();
  let creados = 0;
  let actualizados = 0;

  let orden = 0;
  for (const p of todos) {
    orden++;
    const key = p.nombre.toLowerCase();
    vistos.add(key);
    const horariosData = Object.entries(p.horarios).map(([dia, horario]) => ({
      dia: Number(dia),
      horario,
    }));

    const existente = porNombre.get(key);
    if (existente) {
      await db.colaborador.update({
        where: { id: existente.id },
        data: {
          usuario: p.usuario || existente.usuario,
          grupo: p.grupo,
          activo: true,
          orden,
          horarios: { deleteMany: {}, create: horariosData },
        },
      });
      actualizados++;
    } else {
      await db.colaborador.create({
        data: {
          nombre: p.nombre,
          usuario: p.usuario,
          grupo: p.grupo,
          activo: true,
          orden,
          horarios: { create: horariosData },
        },
      });
      creados++;
    }
  }

  // Desactiva (no borra) los que ya no aparecen.
  let desactivados = 0;
  for (const c of existentes) {
    if (!vistos.has(c.nombre.toLowerCase()) && c.activo) {
      await db.colaborador.update({ where: { id: c.id }, data: { activo: false } });
      desactivados++;
    }
  }

  console.log(
    `\nListo. Creados: ${creados}, actualizados: ${actualizados}, desactivados: ${desactivados}.`,
  );
  await db.$disconnect();
})().catch(async (e) => {
  console.error("Error:", e.message);
  await db.$disconnect();
  process.exit(1);
});
