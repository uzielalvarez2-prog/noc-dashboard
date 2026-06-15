"use client";

import { useState } from "react";
import { Download, Copy, Check } from "lucide-react";
import type { ClosedRankRow } from "@/types/closed";
import { copyHTMLTable } from "@/lib/openExport";
import { downloadXLSX } from "@/lib/excelExport";

// Paleta de colores para causas (cada una un color distinto)
const CAUSE_PALETTE = [
  "#38bdf8", // sky
  "#f59e0b", // amber
  "#a78bfa", // violet
  "#34d399", // emerald
  "#fb7185", // rose
  "#fb923c", // orange
  "#22d3ee", // cyan
  "#f472b6", // fuchsia
  "#a3e635", // lime
  "#e879f9", // purple
  "#4ade80", // green
  "#94a3b8", // slate
];

// Semáforo por volumen de cierres: 31+ verde, 20-30 ámbar, <20 rojo
function analystColor(count: number): string {
  if (count >= 31) return "#22c55e";
  if (count >= 20) return "#f59e0b";
  return "#ef4444";
}

// "NOMBRE SEGUNDO APELLIDO1 APELLIDO2" → "NOMBRE APELLIDO1" para que quepa
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length <= 2 ? full : `${parts[0]} ${parts[parts.length - 2]}`;
}

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

export function ClosedRanking({
  title,
  dimensionLabel,
  rows,
  fileBase,
  limit = 12,
  variant = "default",
}: {
  title: string;
  dimensionLabel: string;
  rows: ClosedRankRow[];
  fileBase: string;
  limit?: number;
  variant?: "analyst" | "cause" | "default";
}) {
  const [copied, setCopied] = useState(false);

  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, limit);
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...top.map((r) => r.count));

  function barColor(idx: number, count: number): string {
    if (variant === "analyst") return analystColor(count);
    if (variant === "cause") return CAUSE_PALETTE[idx % CAUSE_PALETTE.length];
    return "#38bdf8"; // default accent
  }

  async function onCopy() {
    if (await copyHTMLTable(toHTMLTable(top, title, dimensionLabel), toPlain(top))) {
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

  return (
    <div className="rounded-xl border border-border/60 bg-surface/60 p-4 backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {variant === "analyst" && (
          <div className="flex items-center gap-2 text-[10px] text-text-muted">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#22c55e]" /> 31+
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> 20-30
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#ef4444]" /> &lt;20
            </span>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        {top.length === 0 && (
          <p className="py-6 text-center text-xs text-text-muted">Sin datos — sube un CSV de cerrados</p>
        )}
        {top.map((r, idx) => {
          const color = barColor(idx, r.count);
          return (
            <div key={r.name} className="flex items-center gap-2">
              <span className="w-40 shrink-0 truncate text-xs text-text-primary" title={r.name}>
                {variant === "analyst" ? shortName(r.name) : r.name}
              </span>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-surface-elevated/60">
                <div
                  className="absolute inset-y-0 left-0 rounded transition-all duration-500"
                  style={{
                    width: `${(r.count / max) * 100}%`,
                    backgroundColor: color,
                    opacity: 0.7,
                  }}
                />
              </div>
              <span
                className="w-10 shrink-0 text-right font-mono text-xs font-semibold"
                style={{ color }}
              >
                {r.count}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
        <span className="text-sm text-text-muted">
          <span className="font-bold text-lg text-text-primary">{total}</span>{" "}
          cerrados
        </span>
        <div className="flex gap-2">
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
        </div>
      </div>
    </div>
  );
}
