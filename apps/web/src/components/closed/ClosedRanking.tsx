"use client";

import { useState } from "react";
import { Download, Copy, Check, Camera } from "lucide-react";
import type { ClosedRankRow } from "@/types/closed";
import { copyHTMLTable } from "@/lib/openExport";
import { downloadXLSX } from "@/lib/excelExport";
import { useTheme } from "@/components/layout/ThemeProvider";
import { canvasPalette } from "@/lib/chartTheme";

// Paleta sobria para causas: azules (no tan claros), verdes y marrones
const CAUSE_PALETTE = [
  "#2563eb", // azul
  "#16a34a", // verde
  "#b45309", // marrón
  "#1d4ed8", // azul oscuro
  "#15803d", // verde oscuro
  "#a16207", // marrón dorado
  "#0e7490", // azul petróleo
  "#4d7c0f", // verde oliva
  "#92400e", // marrón rojizo
  "#3b82f6", // azul medio
  "#166534", // verde bosque
  "#c2410c", // marrón anaranjado
];

// Semáforo por volumen de cierres: 31+ verde, 20-30 ámbar, <20 rojo
function analystColor(count: number): string {
  if (count >= 31) return "#22c55e";
  if (count >= 20) return "#f59e0b";
  return "#ef4444";
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
  const [imgCopied, setImgCopied] = useState(false);
  const { theme } = useTheme();

  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const top = sorted;
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

  async function onDownloadImage() {
    const SCALE = 2;
    const W = 480;
    const PAD = 16;
    const TITLE_H = 58;
    const ROW_H = 20;
    const GAP = 7;
    const NAME_W = 172;
    const COUNT_W = 44;
    const totalH = TITLE_H + top.length * (ROW_H + GAP) + PAD;

    const pal = canvasPalette(theme);

    const canvas = document.createElement("canvas");
    canvas.width = W * SCALE;
    canvas.height = totalH * SCALE;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(SCALE, SCALE);

    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, totalH);

    // Para "Por causa" (cause): título centrado + total centrado debajo (como en Overview)
    const centerHeader = variant === "cause";
    ctx.fillStyle = pal.title;
    ctx.font = "bold 14px Arial,sans-serif";
    ctx.textAlign = centerHeader ? "center" : "left";
    ctx.fillText(title, centerHeader ? W / 2 : PAD, 24);

    ctx.fillStyle = pal.text;
    ctx.font = "bold 12px Arial,sans-serif";
    ctx.fillText(`${total} cerrados`, centerHeader ? W / 2 : PAD, 42);

    const barMaxW = W - PAD - NAME_W - COUNT_W - PAD;

    top.forEach((r, idx) => {
      const color = barColor(idx, r.count);
      const y = TITLE_H + idx * (ROW_H + GAP);
      const barW = Math.max(2, (r.count / max) * barMaxW);
      const display = r.name.length > 23 ? r.name.slice(0, 21) + "…" : r.name;

      ctx.fillStyle = pal.text;
      ctx.font = "11px Arial,sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(display, PAD, y + ROW_H - 5);

      ctx.fillStyle = pal.trackBg;
      ctx.fillRect(PAD + NAME_W, y, barMaxW, ROW_H);

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(PAD + NAME_W, y, barW, ROW_H);
      ctx.globalAlpha = 1;

      ctx.fillStyle = color;
      ctx.font = "bold 11px Arial,sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(String(r.count), W - PAD, y + ROW_H - 5);
    });

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
      {variant === "cause" ? (
        <div className="mb-3 text-center">
          <h3 className="text-sm font-bold text-text-primary">{title}</h3>
          <p className="mt-0.5 text-xs text-text-muted">
            <span className="text-base font-bold text-text-primary">{total}</span> cerrados
          </p>
        </div>
      ) : (
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
      )}

      <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {top.length === 0 && (
          <p className="py-6 text-center text-xs text-text-muted">Sin datos — sube un CSV de cerrados</p>
        )}
        {top.map((r, idx) => {
          const color = barColor(idx, r.count);
          return (
            <div key={r.name} className="flex items-center gap-2">
              <span className="w-40 shrink-0 truncate text-xs text-text-primary" title={r.name}>
                {r.name}
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
        {variant === "cause" ? (
          <span />
        ) : (
          <span className="text-sm text-text-muted">
            <span className="font-bold text-lg text-text-primary">{total}</span>{" "}
            cerrados
          </span>
        )}
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
            onClick={onDownloadImage}
            className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
          >
            {imgCopied ? <Check className="h-3.5 w-3.5 text-success" /> : <Camera className="h-3.5 w-3.5" />}
            {imgCopied ? "Copiada" : "Imagen"}
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
