import type { TopRow } from "@/types/open";

type Metric = "sites" | "incidents";

function metricLabel(m: Metric): string {
  return m === "sites" ? "Sitios afectados" : "Incidentes";
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV de un ranking Top (Estado/Distrito). BOM incluido para acentos en Excel. */
export function topToCSV(rows: TopRow[], dimensionLabel: string): string {
  const header = [dimensionLabel, "Sitios afectados", "Incidentes"].join(",");
  const lines = rows.map((r) => [csvCell(r.name), r.sites, r.incidents].join(","));
  return [header, ...lines].join("\r\n");
}

export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Tabla HTML lista para pegar en un correo (Outlook/Gmail la pegan formateada). */
export function topToHTMLTable(
  rows: TopRow[],
  title: string,
  dimensionLabel: string,
  metric: Metric
): string {
  const head = `<tr><th align="left">${escapeHtml(dimensionLabel)}</th><th align="right">${metricLabel(metric)}</th></tr>`;
  const body = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.name)}</td><td align="right">${metric === "sites" ? r.sites : r.incidents}</td></tr>`
    )
    .join("");
  return `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><caption style="font-weight:bold;text-align:left;padding-bottom:6px">${escapeHtml(
    title
  )}</caption><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/** Copia tabla al portapapeles como HTML (formato) + texto plano (respaldo). */
export async function copyHTMLTable(html: string, plain: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      "write" in navigator.clipboard &&
      typeof ClipboardItem !== "undefined"
    ) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
    await navigator.clipboard.writeText(plain);
    return true;
  } catch {
    return false;
  }
}

export function topToPlain(rows: TopRow[], metric: Metric): string {
  return rows.map((r) => `${r.name}\t${metric === "sites" ? r.sites : r.incidents}`).join("\n");
}
