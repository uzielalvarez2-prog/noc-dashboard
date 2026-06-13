// Exporta datos a un .xlsx real con formato de Tabla de Excel: encabezados con
// filtros desplegables, fila congelada y estilo a rayas. Queda listo para
// "Insertar > Tabla dinámica" de un solo clic. exceljs se carga de forma
// diferida (dynamic import) para no inflar el bundle principal.

function sanitizeSheetName(name: string): string {
  // Excel: máx 31 chars y sin : \ / ? * [ ]
  return name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Datos";
}

function sanitizeTableName(name: string): string {
  // Nombre de tabla: sin espacios ni caracteres especiales, debe iniciar con letra
  const clean = name.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z]/.test(clean) ? clean : `T_${clean}`;
}

export async function downloadXLSX(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number)[][],
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "NOC Dashboard";
  wb.created = new Date();

  const ws = wb.addWorksheet(sanitizeSheetName(sheetName));

  // Tabla de Excel (ListObject) — da filtros y formato "dinámico"
  ws.addTable({
    name: sanitizeTableName(filename.replace(/\.xlsx$/i, "")),
    ref: "A1",
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: headers.map((h) => ({ name: h, filterButton: true })),
    rows: rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : c))),
  });

  // Anchos automáticos aproximados según el contenido
  ws.columns.forEach((col, i) => {
    let max = headers[i]?.length ?? 10;
    for (const r of rows) {
      const len = String(r[i] ?? "").length;
      if (len > max) max = len;
    }
    col.width = Math.min(Math.max(max + 2, 10), 50);
  });

  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
