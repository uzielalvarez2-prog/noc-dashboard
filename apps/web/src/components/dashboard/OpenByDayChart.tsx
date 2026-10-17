"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Camera, Check } from "lucide-react";
import { useTheme } from "@/components/layout/ThemeProvider";
import { canvasPalette } from "@/lib/chartTheme";

interface DayPoint {
  day: string;
  PEXA: number;
  CECOR: number;
  total: number;
}

async function fetchByDay(): Promise<DayPoint[]> {
  const res = await fetch("/api/incidents/by-day");
  if (!res.ok) throw new Error("Error al obtener datos");
  return res.json();
}

const TITLE = "Dilación - Incidentes Pexa";
const PEXA_COLOR = "#4a6fa5";
const CECOR_COLOR = "#c9a24d";

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "#0d1526",
    border: "1px solid #1e3048",
    borderRadius: "6px",
    color: "#e2e8f0",
    fontSize: "12px",
  },
  labelStyle: { color: "#64748b" },
};

// Dilación: el día más antiguo en rojo apagado, el más reciente en verde apagado
// (los datos vienen cronológicos, del más viejo al más nuevo).
function ageColor(i: number, n: number): string {
  const t = n > 1 ? i / (n - 1) : 1;
  return `hsl(${Math.round(4 + t * 136)}, 36%, 52%)`;
}

interface Props {
  initial: DayPoint[];
}

export function OpenByDayChart({ initial }: Props) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);

  const { data } = useQuery<DayPoint[]>({
    queryKey: ["incidents-by-day"],
    queryFn: fetchByDay,
    placeholderData: initial,
    refetchInterval: 60_000,
  });

  const chartData = data ?? initial;
  const grandTotal = chartData.reduce((s, d) => s + d.total, 0);
  const totalPexa = chartData.reduce((s, d) => s + d.PEXA, 0);
  const totalCecor = chartData.reduce((s, d) => s + d.CECOR, 0);
  const pct = (v: number) => (grandTotal ? Math.round((v / grandTotal) * 100) : 0);

  // Anillo exterior: un día por porción. Anillo interior: PEXA vs CECOR.
  const days = chartData.map((d, i) => ({ ...d, fill: ageColor(i, chartData.length) }));
  const groups = [
    { name: "PEXA", value: totalPexa, fill: PEXA_COLOR },
    { name: "CECOR", value: totalCecor, fill: CECOR_COLOR },
  ].filter((g) => g.value > 0);

  async function copyAsImage() {
    if (!chartData.length) return;
    const SCALE = 2;
    const W = 540;
    const PAD = 18;
    const TITLE_H = 70;
    const CX = 126;
    const CY = TITLE_H + 108;
    const LEGEND_X = 262;
    const LINE_H = 19;
    const rows = days.length + 1; // + encabezado
    const totalH = Math.max(TITLE_H + 2 * 108 + PAD, TITLE_H + rows * LINE_H + PAD * 2);

    const pal = canvasPalette(theme);
    const canvas = document.createElement("canvas");
    canvas.width = W * SCALE;
    canvas.height = totalH * SCALE;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, totalH);

    // Título + totales PEXA / CECOR / total
    ctx.textAlign = "center";
    ctx.fillStyle = pal.title;
    ctx.font = "bold 14px Arial,sans-serif";
    ctx.fillText(TITLE, W / 2, 24);
    const parts = [
      { text: String(totalPexa), color: PEXA_COLOR, bold: true, size: 17 },
      { text: " PEXA    ", color: pal.muted, bold: false, size: 11 },
      { text: String(totalCecor), color: CECOR_COLOR, bold: true, size: 17 },
      { text: " CECOR    ", color: pal.muted, bold: false, size: 11 },
      { text: String(grandTotal), color: pal.title, bold: true, size: 17 },
      { text: " total", color: pal.muted, bold: false, size: 11 },
    ];
    const font = (p: (typeof parts)[number]) => `${p.bold ? "bold " : ""}${p.size}px Arial,sans-serif`;
    let tw = 0;
    for (const p of parts) {
      ctx.font = font(p);
      tw += ctx.measureText(p.text).width;
    }
    let hx = (W - tw) / 2;
    ctx.textAlign = "left";
    for (const p of parts) {
      ctx.font = font(p);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, hx, 50);
      hx += ctx.measureText(p.text).width;
    }

    // Anillos: arrancan arriba y giran en sentido horario.
    const ring = (items: { value: number; fill: string }[], rOut: number, rIn: number) => {
      const sum = items.reduce((s, d) => s + d.value, 0) || 1;
      let a0 = -Math.PI / 2;
      for (const d of items) {
        const a1 = a0 + (d.value / sum) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(CX, CY);
        ctx.arc(CX, CY, rOut, a0, a1);
        ctx.closePath();
        ctx.fillStyle = d.fill;
        ctx.fill();
        ctx.strokeStyle = pal.bg;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        a0 = a1;
      }
      ctx.beginPath();
      ctx.arc(CX, CY, rIn, 0, Math.PI * 2);
      ctx.fillStyle = pal.bg;
      ctx.fill();
    };
    ring(days.map((d) => ({ value: d.total, fill: d.fill })), 100, 76);
    ring(groups, 68, 48);

    ctx.textAlign = "center";
    ctx.fillStyle = pal.title;
    ctx.font = "bold 20px Arial,sans-serif";
    ctx.fillText(String(grandTotal), CX, CY + 3);
    ctx.fillStyle = pal.muted;
    ctx.font = "9px Arial,sans-serif";
    ctx.fillText("ABIERTOS", CX, CY + 16);

    // Tabla: Día | PEXA | CECOR | Total | %
    const COL = { pexa: 372, cecor: 430, total: 484, pct: W - PAD };
    ctx.font = "bold 10px Arial,sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = pal.muted;
    ctx.fillText("DÍA", LEGEND_X + 16, TITLE_H + 10);
    ctx.textAlign = "right";
    ctx.fillStyle = PEXA_COLOR;
    ctx.fillText("PEXA", COL.pexa, TITLE_H + 10);
    ctx.fillStyle = CECOR_COLOR;
    ctx.fillText("CECOR", COL.cecor, TITLE_H + 10);
    ctx.fillStyle = pal.muted;
    ctx.fillText("TOTAL", COL.total, TITLE_H + 10);
    ctx.fillText("%", COL.pct, TITLE_H + 10);
    days.forEach((d, i) => {
      const y = TITLE_H + (i + 1) * LINE_H + 10;
      ctx.fillStyle = d.fill;
      ctx.fillRect(LEGEND_X, y - 9, 10, 10);
      ctx.textAlign = "left";
      ctx.fillStyle = pal.text;
      ctx.font = "11px Arial,sans-serif";
      ctx.fillText(d.day, LEGEND_X + 16, y);
      ctx.textAlign = "right";
      ctx.fillText(String(d.PEXA), COL.pexa, y);
      ctx.fillText(String(d.CECOR), COL.cecor, y);
      ctx.font = "bold 11px Arial,sans-serif";
      ctx.fillText(String(d.total), COL.total, y);
      ctx.fillStyle = pal.muted;
      ctx.font = "11px Arial,sans-serif";
      ctx.fillText(`${pct(d.total)}%`, COL.pct, y);
    });

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "incidentes-por-dia.png";
        a.click();
      }
    }, "image/png");
  }

  const colGrid = "grid grid-cols-[1fr_2.5rem_3rem_2.5rem_2.5rem] items-center gap-x-2";

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="relative mb-3">
        <button
          type="button"
          onClick={copyAsImage}
          title="Copiar gráfica como imagen"
          className="absolute right-0 top-0 flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Camera className="h-3.5 w-3.5" />}
          {copied ? "Copiada" : "Copiar imagen"}
        </button>
        <div className="text-center">
          <h2 className="text-base font-semibold text-text-primary">{TITLE}</h2>
          <div className="mt-1 flex flex-wrap items-baseline justify-center gap-3">
            <span className="font-mono text-xs">
              <span className="text-lg font-bold" style={{ color: PEXA_COLOR }}>{totalPexa}</span>{" "}
              <span className="text-text-muted">PEXA</span>
            </span>
            <span className="font-mono text-xs">
              <span className="text-lg font-bold" style={{ color: CECOR_COLOR }}>{totalCecor}</span>{" "}
              <span className="text-text-muted">CECOR</span>
            </span>
            <span className="font-mono text-xs">
              <span className="text-lg font-bold text-text-primary">{grandTotal}</span>{" "}
              <span className="text-text-muted">total</span>
            </span>
          </div>
          <p className="mt-1 text-[11px] text-text-muted">
            Anillo exterior: día de apertura (rojo = más antiguo, verde = más reciente) · Anillo interior: PEXA / CECOR
          </p>
        </div>
      </div>

      {chartData.length === 0 ? (
        <p className="py-8 text-center text-xs text-text-muted">Sin datos</p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <div className="relative h-56 w-56 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={days} dataKey="total" nameKey="day" innerRadius={78} outerRadius={104} startAngle={90} endAngle={-270} paddingAngle={1} stroke="none">
                  {days.map((d) => (
                    <Cell key={d.day} fill={d.fill} />
                  ))}
                </Pie>
                <Pie data={groups} dataKey="value" nameKey="name" innerRadius={52} outerRadius={70} startAngle={90} endAngle={-270} paddingAngle={2} stroke="none">
                  {groups.map((g) => (
                    <Cell key={g.name} fill={g.fill} />
                  ))}
                </Pie>
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value, _name, item) => {
                    const n = typeof value === "number" ? value : Number(value) || 0;
                    const p = (item as { payload?: Partial<DayPoint> & { name?: string } })?.payload;
                    if (p?.day !== undefined) {
                      return [`${p.PEXA ?? 0} PEXA · ${p.CECOR ?? 0} CECOR (${n} total)`, p.day];
                    }
                    return [`${n} incidentes (${pct(n)}%)`, p?.name ?? ""];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold text-text-primary">{grandTotal.toLocaleString("es-MX")}</span>
              <span className="text-[9px] uppercase tracking-wider text-text-muted">abiertos</span>
            </div>
          </div>

          <div className="max-h-64 w-full max-w-sm overflow-y-auto pr-1 text-xs">
            <div className={`${colGrid} sticky top-0 bg-surface pb-1 text-[10px] font-semibold uppercase text-text-muted`}>
              <span>Día</span>
              <span className="text-right" style={{ color: PEXA_COLOR }}>PEXA</span>
              <span className="text-right" style={{ color: CECOR_COLOR }}>CECOR</span>
              <span className="text-right">Total</span>
              <span className="text-right">%</span>
            </div>
            {days.map((d) => (
              <div key={d.day} className={`${colGrid} py-0.5`}>
                <span className="flex items-center gap-2 truncate text-text-primary">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.fill }} />
                  {d.day}
                </span>
                <span className="text-right font-mono text-text-primary">{d.PEXA}</span>
                <span className="text-right font-mono text-text-primary">{d.CECOR}</span>
                <span className="text-right font-mono font-semibold text-text-primary">{d.total}</span>
                <span className="text-right font-mono text-text-muted">{pct(d.total)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
