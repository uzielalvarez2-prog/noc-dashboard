"use client";

import { useState } from "react";
import { Download, Copy, Check, ChevronDown } from "lucide-react";
import type { ClosedRankRow } from "@/types/closed";
import { copyHTMLTable } from "@/lib/openExport";
import { downloadXLSX } from "@/lib/excelExport";
import { DonutChart } from "@/components/shared/DonutChart";
import { toDonutTop } from "@/lib/donutData";
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
}: {
  title: string;
  dimensionLabel: string;
  rows: ClosedRankRow[];
  fileBase: string;
  limit?: number;
  /** Muestra, bajo la dona, un desplegable "Ver todos" con la tabla completa en
   *  2 columnas (cerrados + %). Para rankings largos como Analistas. */
  showFullTable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const totalCount = sorted.reduce((s, r) => s + r.count, 0);

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
