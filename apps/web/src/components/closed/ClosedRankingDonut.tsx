"use client";

import { useState } from "react";
import { Download, Copy, Check } from "lucide-react";
import type { ClosedRankRow } from "@/types/closed";
import { copyHTMLTable } from "@/lib/openExport";
import { downloadXLSX } from "@/lib/excelExport";
import { DonutChart } from "@/components/shared/DonutChart";
import { toDonutTop } from "@/lib/donutData";

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
export function ClosedRankingDonut({
  title,
  dimensionLabel,
  rows,
  fileBase,
  limit = 12,
}: {
  title: string;
  dimensionLabel: string;
  rows: ClosedRankRow[];
  fileBase: string;
  limit?: number;
}) {
  const [copied, setCopied] = useState(false);
  const sorted = [...rows].sort((a, b) => b.count - a.count);

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

  return (
    <DonutChart
      title={title}
      data={toDonutTop(rows, (n) => n, limit)}
      centerLabel="cerrados"
      unitLabel="cerrados"
      fileBase={fileBase}
      actions={actions}
    />
  );
}
