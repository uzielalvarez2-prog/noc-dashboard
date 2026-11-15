"use client";

import { useState } from "react";
import { Download, Copy, Check, ChevronDown, Camera } from "lucide-react";
import type { ClosedRankRow } from "@/types/closed";
import { copyHTMLTable } from "@/lib/openExport";
import { downloadXLSX } from "@/lib/excelExport";
import { DonutChart } from "@/components/shared/DonutChart";
import { toDonutTop } from "@/lib/donutData";
import { canvasPalette } from "@/lib/chartTheme";
import { useTheme } from "@/components/layout/ThemeProvider";
import { cn } from "@/lib/utils";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toHTMLTable(rows: ClosedRankRow[], title: string, dimensionLabel: string): string {
  const head = `<tr><th align="left">${escapeHtml(dimensionLabel)}</th><th align="right">Cerrados</th></tr>`;
  const body = rows
    .map((r) => `<tr><td>${escapeHtml(r.name)}</td><td align="right">${r.count}</td></tr>`)
    .join("");
  return `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><caption style="font-weight:bold;text-align:left;padding-bottom:6px">${escapeHtml(title)}</caption><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function toPlain(rows: ClosedRankRow[]): string {
  return rows.map((r) => `${r.name}\t${r.count}`).join("\n");
}

// Dona homologada al overview (anillo + leyenda con conteo/%), pero conservando
// los botones Copiar tabla y Excel de la vista de detalle. La exportación a
// imagen la aporta DonutChart (botón Imagen).
// Reparte una lista en N columnas rellenando por columnas (la 1ª columna son los
// primeros ceil(total/N), etc.), para que la tabla completa quede corta en alto.
function splitColumns<T>(items: T[], cols: number): T[][] {
  const perCol = Math.ceil(items.length / cols);
  const out: T[][] = [];
  for (let c = 0; c < cols; c++) out.push(items.slice(c * perCol, (c + 1) * perCol));
  return out;
}

export function ClosedRankingDonut({
  title,
  dimensionLabel,
  rows,
  fileBase,
  limit = 12,
  showFullTable = false,
  imageTableTitle,
  imageDateLabel,
}: {
  title: string;
  dimensionLabel: string;
  rows: ClosedRankRow[];
  fileBase: string;
  limit?: number;
  /** Muestra, bajo la dona, un desplegable "Ver todos" con la tabla completa en
   *  2 columnas (cerrados + %). Para rankings largos como Analistas. */
  showFullTable?: boolean;
  /** Si se define (solo con showFullTable), el botón "Imagen" copia una imagen
   *  de la TABLA COMPLETA (todos los analistas) con este título, en vez de la
   *  dona. Ej. "Total de cerrados por agente". */
  imageTableTitle?: string;
  /** Fecha ya formateada (ej. "17 Nov 2026") que se dibuja en la imagen de la
   *  tabla, junto al total. Vacío/undefined = no se muestra fecha. */
  imageDateLabel?: string;
}) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [imgCopied, setImgCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const totalCount = sorted.reduce((s, r) => s + r.count, 0);

  // Copia una IMAGEN de la tabla completa (todos los analistas) al portapapeles,
  // en 2 columnas y con total general. Pensada para pegar en WhatsApp/correo sin
  // tener que exportar a Excel. Respeta el tema (claro/oscuro) del dashboard.
  async function copyTableImage() {
    const pal = canvasPalette(theme);
    const SCALE = 2;
    const PAD = 24;
    const TITLE_H = 38;
    const SUB_H = 26;
    const HEAD_H = 30;
    const ROW_H = 26; // filas más altas para la letra más grande
    const COL_W = 350; // ancho de cada columna de datos
    const COL_GAP = 36;
    const cols = splitColumns(sorted, 2);
    const rowsPerCol = cols[0]?.length ?? 0;
    const W = PAD * 2 + COL_W * 2 + COL_GAP;
    const H = PAD * 2 + TITLE_H + SUB_H + HEAD_H + rowsPerCol * ROW_H;

    const canvas = document.createElement("canvas");
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    // Título
    ctx.fillStyle = pal.title;
    ctx.font = "bold 22px Arial,sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(imageTableTitle ?? title, PAD, PAD + 20);

    // Subtítulo: fecha (si hay) · total general y nº de agentes
    ctx.fillStyle = pal.text;
    ctx.font = "bold 15px Arial,sans-serif";
    const resumen = `Total: ${totalCount.toLocaleString("es-MX")} cerrados · ${sorted.length} ${dimensionLabel.toLowerCase()}s`;
    ctx.fillText(imageDateLabel ? `${imageDateLabel}  ·  ${resumen}` : resumen, PAD, PAD + TITLE_H + 14);

    const bodyTop = PAD + TITLE_H + SUB_H;
    // Dibuja una columna de datos en x0.
    const drawCol = (col: ClosedRankRow[], x0: number, startRank: number) => {
      const xName = x0 + 34;
      const xCount = x0 + COL_W - 72;
      const xPct = x0 + COL_W;
      // Encabezado de columna
      ctx.font = "bold 14px Arial,sans-serif";
      ctx.fillStyle = pal.muted;
      ctx.textAlign = "left";
      ctx.fillText("#", x0, bodyTop + 16);
      ctx.fillText(dimensionLabel, xName, bodyTop + 16);
      ctx.textAlign = "right";
      ctx.fillText("Cerrados", xCount, bodyTop + 16);
      ctx.fillText("%", xPct, bodyTop + 16);
      // Línea bajo el encabezado
      ctx.strokeStyle = pal.grid;
      ctx.beginPath();
      ctx.moveTo(x0, bodyTop + HEAD_H - 2);
      ctx.lineTo(x0 + COL_W, bodyTop + HEAD_H - 2);
      ctx.stroke();
      // Filas (todo en negrita, letra más grande)
      col.forEach((r, i) => {
        const y = bodyTop + HEAD_H + i * ROW_H + 18;
        const rank = startRank + i;
        const pct = totalCount ? Math.round((r.count / totalCount) * 1000) / 10 : 0;
        ctx.font = "bold 16px Arial,sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = pal.muted;
        ctx.fillText(String(rank), x0, y);
        ctx.fillStyle = pal.text;
        const name = r.name.length > 26 ? r.name.slice(0, 24) + "…" : r.name;
        ctx.fillText(name, xName, y);
        ctx.textAlign = "right";
        ctx.fillStyle = pal.title;
        ctx.fillText(String(r.count), xCount, y);
        ctx.fillStyle = pal.muted;
        ctx.fillText(`${pct}%`, xPct, y);
      });
    };

    drawCol(cols[0] ?? [], PAD, 1);
    if (cols[1]?.length) drawCol(cols[1], PAD + COL_W + COL_GAP, rowsPerCol + 1);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setImgCopied(true);
        setTimeout(() => setImgCopied(false), 1500);
      } catch {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${fileBase}.png`;
        a.click();
      }
    }, "image/png");
  }

  async function onCopy() {
    if (await copyHTMLTable(toHTMLTable(sorted, title, dimensionLabel), toPlain(sorted))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  function onExport() {
    downloadXLSX(
      `${fileBase}.xlsx`,
      dimensionLabel,
      [dimensionLabel, "Cerrados"],
      sorted.map((r) => [r.name, r.count]),
    );
  }

  // Con imageTableTitle, el botón Imagen copia la TABLA completa (no la dona).
  const tableImageBtn = imageTableTitle ? (
    <button
      type="button"
      onClick={copyTableImage}
      title="Copiar la tabla completa como imagen"
      className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
    >
      {imgCopied ? <Check className="h-3.5 w-3.5 text-success" /> : <Camera className="h-3.5 w-3.5" />}
      {imgCopied ? "Copiada" : "Imagen"}
    </button>
  ) : null;

  const actions = (
    <>
      <button
        type="button"
        onClick={onCopy}
        className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-primary"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copiado" : "Copiar tabla"}
      </button>
      <button
        type="button"
        onClick={onExport}
        className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-primary"
      >
        <Download className="h-3.5 w-3.5" /> Excel
      </button>
      {tableImageBtn}
    </>
  );

  const donut = (
    <DonutChart
      title={title}
      data={toDonutTop(rows, (n) => n, limit)}
      centerLabel="cerrados"
      unitLabel="cerrados"
      fileBase={fileBase}
      actions={actions}
      bare={showFullTable}
      // Si la tarjeta aporta su propio botón Imagen (de la tabla), ocultar el de la dona.
      hideImageButton={!!imageTableTitle}
    />
  );

  // Sin tabla completa: la dona se renderiza con su propio recuadro.
  if (!showFullTable) return donut;

  // Con tabla completa: recuadro propio (encabezado con acciones + dona bare),
  // y debajo el desplegable "Ver todos" con los analistas en 2 columnas.
  const columns = splitColumns(sorted, 2);
  return (
    <div className="rounded-xl border border-border/60 bg-surface/60 p-4 backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <div className="flex gap-2">{actions}</div>
      </div>
      {donut}

      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="mt-4 flex w-full items-center justify-center gap-1 rounded-md border border-border bg-surface py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text-primary"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")} />
        {showAll ? "Ocultar lista completa" : `Ver todos (${sorted.length})`}
      </button>

      {showAll && (
        <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {columns.map((col, ci) => (
            <div key={ci} className="space-y-1">
              {col.map((r, ri) => {
                const rank = ci * columns[0].length + ri + 1;
                const pct = totalCount ? Math.round((r.count / totalCount) * 1000) / 10 : 0;
                return (
                  <div key={r.name} className="flex items-center gap-2 text-xs">
                    <span className="w-6 shrink-0 text-right font-mono text-text-muted">{rank}</span>
                    <span className="flex-1 truncate text-text-primary" title={r.name}>{r.name}</span>
                    <span className="font-mono font-semibold text-text-primary">{r.count}</span>
                    <span className="w-10 text-right font-mono text-text-muted">{pct}%</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
