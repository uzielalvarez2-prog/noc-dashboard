"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { ArrowDown, ArrowUp, Camera, Check } from "lucide-react";
import { useTheme } from "@/components/layout/ThemeProvider";
import { canvasPalette } from "@/lib/chartTheme";

export interface MonthlyIncidentPoint {
  month: string;
  label: string;
  total: number;
  changePct: number | null;
  isPartial: boolean;
  projectedTotal: number | null;
  trend: number | null;
}

async function fetchMonthlyTrend(): Promise<MonthlyIncidentPoint[]> {
  const res = await fetch("/api/incidents/monthly-trend?group=PEXA");
  if (!res.ok) throw new Error("Error al obtener tendencia mensual");
  return res.json();
}

const BAR_COLOR = "#3b82f6";
const BAR_COLOR_PARTIAL = "#1e3048";
const TREND_COLOR = "#94a3b8"; // gris recesivo — misma métrica suavizada, no una segunda categoría

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

interface MonthlyIncidentsChartProps {
  initial: MonthlyIncidentPoint[];
}

const fmt = (n: number) => n.toLocaleString("es-MX");

export function MonthlyIncidentsChart({ initial }: MonthlyIncidentsChartProps) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);

  const { data } = useQuery<MonthlyIncidentPoint[]>({
    queryKey: ["monthly-incident-trend"],
    queryFn: fetchMonthlyTrend,
    placeholderData: initial,
    refetchInterval: 240_000,
  });

  const points = data ?? initial;
  const totalYTD = points.reduce((s, p) => s + p.total, 0);
  const current = points[points.length - 1];
  const avgPerMonth = points.length ? Math.round(totalYTD / points.length) : 0;

  async function copyAsImage() {
    if (!points.length) return;
    const SCALE = 2;
    const W = 760;
    const PAD = 24;
    const TITLE_H = 66;
    const CHART_H = 260;
    const LEGEND_H = 24;
    const FOOTER_H = 28;
    const H = TITLE_H + LEGEND_H + CHART_H + FOOTER_H + PAD;

    const pal = canvasPalette(theme);
    const canvas = document.createElement("canvas");
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    // Título
    ctx.textAlign = "left";
    ctx.fillStyle = pal.title;
    ctx.font = "bold 15px Arial,sans-serif";
    ctx.fillText("Incidentes por mes — PEXA", PAD, 26);
    ctx.fillStyle = pal.muted;
    ctx.font = "11px Arial,sans-serif";
    ctx.fillText(
      `Acumulado ${new Date().getUTCFullYear()} · tendencia = media móvil 3 meses`,
      PAD,
      42
    );

    // Stats (derecha)
    const stats = [
      { val: fmt(totalYTD), label: " total YTD" },
      { val: fmt(avgPerMonth), label: " prom./mes" },
      ...(current?.isPartial && current.projectedTotal != null
        ? [{ val: `~${fmt(current.projectedTotal)}`, label: ` proy. ${current.label}`, accent: true }]
        : []),
    ];
    ctx.font = "bold 15px Arial,sans-serif";
    let sw = 0;
    const widths: number[] = [];
    for (const s of stats) {
      ctx.font = "bold 15px Arial,sans-serif";
      const vw = ctx.measureText(s.val).width;
      ctx.font = "11px Arial,sans-serif";
      const lw = ctx.measureText(s.label).width;
      widths.push(vw + lw);
      sw += vw + lw + 20;
    }
    let sx = W - PAD - sw + 20;
    stats.forEach((s, i) => {
      ctx.textAlign = "left";
      ctx.font = "bold 15px Arial,sans-serif";
      ctx.fillStyle = s.accent ? "#3b82f6" : pal.title;
      ctx.fillText(s.val, sx, 26);
      const vw = ctx.measureText(s.val).width;
      ctx.font = "11px Arial,sans-serif";
      ctx.fillStyle = pal.muted;
      ctx.fillText(s.label, sx + vw, 26);
      sx += widths[i] + 20;
    });

    // Leyenda
    const legendY = TITLE_H + 10;
    ctx.textAlign = "left";
    ctx.fillStyle = BAR_COLOR;
    ctx.fillRect(PAD, legendY - 8, 10, 10);
    ctx.fillStyle = pal.muted;
    ctx.font = "11px Arial,sans-serif";
    ctx.fillText("Incidentes del mes", PAD + 16, legendY + 1);
    const legend2X = PAD + 16 + ctx.measureText("Incidentes del mes").width + 20;
    ctx.strokeStyle = TREND_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(legend2X, legendY - 3);
    ctx.lineTo(legend2X + 14, legendY - 3);
    ctx.stroke();
    ctx.fillStyle = pal.muted;
    ctx.fillText("Tendencia (media móvil 3m)", legend2X + 20, legendY + 1);

    // Gráfica: barras + línea
    const chartTop = TITLE_H + LEGEND_H;
    const chartBottom = chartTop + CHART_H - 24;
    const plotL = PAD + 8;
    const plotR = W - PAD;
    const plotW = plotR - plotL;
    const n = points.length;
    const slot = plotW / n;
    const barW = Math.min(26, slot * 0.5);
    const maxVal = Math.max(...points.map((p) => p.total), ...points.map((p) => p.trend || 0)) * 1.15;
    const niceMax = Math.ceil(maxVal / 500) * 500 || 1;
    const yScale = (v: number) => chartBottom - (v / niceMax) * (chartBottom - chartTop);
    const xCenter = (i: number) => plotL + slot * i + slot / 2;

    // gridlines
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    ctx.font = "10px Arial,sans-serif";
    ctx.fillStyle = pal.muted;
    for (let s = 0; s <= 4; s++) {
      const v = (niceMax / 4) * s;
      const y = yScale(v);
      ctx.beginPath();
      ctx.moveTo(plotL, y);
      ctx.lineTo(plotR, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(v >= 1000 ? `${v / 1000}K` : String(v), plotL - 6, y + 3);
    }

    // barras + valores + mes
    points.forEach((p, i) => {
      const x = xCenter(i) - barW / 2;
      const y = yScale(p.total);
      const h = chartBottom - y;
      ctx.fillStyle = p.isPartial ? BAR_COLOR_PARTIAL : BAR_COLOR;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, h, [4, 4, 0, 0]);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillStyle = pal.text;
      ctx.font = "10px Arial,sans-serif";
      ctx.fillText(fmt(p.total), xCenter(i), y - 6);
      ctx.fillStyle = pal.muted;
      ctx.fillText(p.label, xCenter(i), chartBottom + 16);
    });

    // línea de tendencia
    ctx.strokeStyle = TREND_COLOR;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    let started = false;
    for (const p of points) {
      if (p.trend == null) continue;
      const x = xCenter(points.indexOf(p));
      const y = yScale(p.trend);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    for (const p of points) {
      if (p.trend == null) continue;
      const x = xCenter(points.indexOf(p));
      const y = yScale(p.trend);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = TREND_COLOR;
      ctx.fill();
    }

    // % cambio por mes (footer)
    const footerY = chartTop + CHART_H + 20;
    ctx.textAlign = "left";
    ctx.font = "10px Arial,sans-serif";
    let fx = PAD;
    for (const p of points) {
      ctx.fillStyle = pal.muted;
      const labelTxt = `${p.label}: `;
      ctx.fillText(labelTxt, fx, footerY);
      fx += ctx.measureText(labelTxt).width;
      if (p.changePct != null) {
        const txt = `${p.changePct >= 0 ? "▲" : "▼"}${Math.abs(p.changePct)}%`;
        ctx.fillStyle = p.changePct >= 0 ? "#ef4444" : "#22c55e";
        ctx.fillText(txt, fx, footerY);
        fx += ctx.measureText(txt).width;
      }
      if (p.isPartial) {
        const txt = " parcial";
        ctx.fillStyle = pal.muted;
        ctx.fillText(txt, fx, footerY);
        fx += ctx.measureText(txt).width;
      }
      fx += 14;
    }

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "incidentes-por-mes.png";
        a.click();
      }
    }, "image/png");
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-text-primary">
            Incidentes por mes — PEXA
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Acumulado {new Date().getUTCFullYear()} · tendencia = media móvil 3 meses
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-4 font-mono text-xs">
            <span>
              <span className="text-lg font-bold text-text-primary">{fmt(totalYTD)}</span>{" "}
              <span className="text-text-muted">total YTD</span>
            </span>
            <span>
              <span className="text-lg font-bold text-text-primary">{fmt(avgPerMonth)}</span>{" "}
              <span className="text-text-muted">prom./mes</span>
            </span>
            {current?.isPartial && current.projectedTotal != null && (
              <span>
                <span className="text-lg font-bold text-accent">
                  ~{fmt(current.projectedTotal)}
                </span>{" "}
                <span className="text-text-muted">proy. {current.label}</span>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={copyAsImage}
            title="Copiar gráfica como imagen"
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Camera className="h-3.5 w-3.5" />}
            {copied ? "Copiada" : "Copiar imagen"}
          </button>
        </div>
      </div>

      {/* Leyenda — dos series: volumen mensual (barra) y tendencia suavizada (línea) */}
      <div className="mb-3 flex items-center gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BAR_COLOR }} />
          Incidentes del mes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3" style={{ background: TREND_COLOR }} />
          Tendencia (media móvil 3m)
        </span>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 20, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3048" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#1e3048" }}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}K` : String(v))}
            />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(value, name, props) => {
                const p = props.payload as MonthlyIncidentPoint;
                const n = typeof value === "number" ? value : Number(value);
                if (name === "trend") return [Number.isFinite(n) ? fmt(n) : "—", "Tendencia (3m)"];
                if (p.isPartial && p.projectedTotal != null) {
                  return [`${fmt(n)} (proy. ~${fmt(p.projectedTotal)})`, "Incidentes"];
                }
                return [fmt(n), "Incidentes"];
              }}
              labelFormatter={(label, payload) => {
                const p = payload?.[0]?.payload as MonthlyIncidentPoint | undefined;
                if (p?.isPartial) return `${label} (parcial, al día de hoy)`;
                return label;
              }}
            />
            <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {points.map((p) => (
                <Cell key={p.month} fill={p.isPartial ? BAR_COLOR_PARTIAL : BAR_COLOR} />
              ))}
              <LabelList
                dataKey="total"
                position="top"
                style={{ fill: "#e2e8f0", fontSize: 11 }}
                formatter={(v) => (typeof v === "number" ? fmt(v) : String(v ?? ""))}
              />
            </Bar>
            <Line
              dataKey="trend"
              name="trend"
              type="monotone"
              stroke={TREND_COLOR}
              strokeWidth={2}
              dot={{ r: 3, fill: TREND_COLOR, strokeWidth: 0 }}
              activeDot={{ r: 5, stroke: "#0d1526", strokeWidth: 2 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 border-t border-border pt-3">
        {points.map((p) => (
          <div key={p.month} className="flex items-center gap-1 font-mono text-xs">
            <span className="text-text-muted">{p.label}:</span>
            {p.changePct != null && (
              <span
                className={`flex items-center gap-0.5 ${
                  p.changePct >= 0 ? "text-critical" : "text-success"
                }`}
              >
                {p.changePct >= 0 ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                )}
                {Math.abs(p.changePct)}%
              </span>
            )}
            {p.isPartial && <span className="text-text-muted">parcial</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
