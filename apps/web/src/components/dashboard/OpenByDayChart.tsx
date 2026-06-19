"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { Camera, Check } from "lucide-react";

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

const COLORS = { PEXA: "#3b82f6", CECOR: "#f59e0b" };

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

interface Props {
  initial: DayPoint[];
}

export function OpenByDayChart({ initial }: Props) {
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

  async function copyAsImage() {
    const chart = chartData;
    if (!chart.length) return;

    const SCALE = 2;
    const PAD = 20;
    const TITLE_H = 56;
    const CHART_H = 180;
    const BOTTOM = 58;
    const LEGEND_H = 24;
    const BAR_W = 40;
    const GAP = 12;
    const AXIS_L = 32;
    const AXIS_R = 12;

    const n = chart.length;
    const W = Math.max(520, PAD + AXIS_L + n * (BAR_W + GAP) - GAP + AXIS_R + PAD);
    const H = TITLE_H + CHART_H + BOTTOM + LEGEND_H;

    const canvas = document.createElement("canvas");
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(SCALE, SCALE);

    // Fondo
    ctx.fillStyle = "#0d1526";
    ctx.fillRect(0, 0, W, H);

    // Header: título centrado + números PEXA / CECOR / total centrados debajo
    ctx.textAlign = "center";
    ctx.font = "bold 14px Arial,sans-serif";
    ctx.fillStyle = "#f8fafc";
    ctx.fillText("Dilación - Incidentes Pexa", W / 2, 22);

    const parts: Array<{ text: string; color: string; bold: boolean; size: number }> = [
      { text: String(totalPexa), color: "#3b82f6", bold: true, size: 18 },
      { text: " PEXA   ", color: "#64748b", bold: false, size: 11 },
      { text: String(totalCecor), color: "#f59e0b", bold: true, size: 18 },
      { text: " CECOR   ", color: "#64748b", bold: false, size: 11 },
      { text: String(grandTotal), color: "#f8fafc", bold: true, size: 18 },
      { text: " total", color: "#64748b", bold: false, size: 11 },
    ];
    // medir ancho total para centrar la fila de números
    let totalW = 0;
    for (const p of parts) {
      ctx.font = `${p.bold ? "bold " : ""}${p.size}px Arial,sans-serif`;
      totalW += ctx.measureText(p.text).width;
    }
    let hx = (W - totalW) / 2;
    ctx.textAlign = "left";
    for (const p of parts) {
      ctx.font = `${p.bold ? "bold " : ""}${p.size}px Arial,sans-serif`;
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, hx, 46);
      hx += ctx.measureText(p.text).width;
    }

    const maxVal = Math.max(1, ...chart.map((d) => d.total));
    const chartTop = TITLE_H;

    // Grid lines
    ctx.strokeStyle = "#1e3048";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = chartTop + CHART_H - (i / 4) * CHART_H;
      ctx.beginPath();
      ctx.moveTo(PAD + AXIS_L, y);
      ctx.lineTo(W - PAD - AXIS_R, y);
      ctx.stroke();
    }

    // Barras apiladas PEXA (abajo) + CECOR (arriba)
    chart.forEach((d, i) => {
      const x = PAD + AXIS_L + i * (BAR_W + GAP);
      const pexaH = Math.max(0, (d.PEXA / maxVal) * CHART_H);
      const cecorH = Math.max(0, (d.CECOR / maxVal) * CHART_H);
      const pexaY = chartTop + CHART_H - pexaH;
      const cecorY = pexaY - cecorH;

      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(x, pexaY, BAR_W, pexaH);
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(x, cecorY, BAR_W, cecorH);
      ctx.globalAlpha = 1;

      // Total encima
      if (d.total > 0) {
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "bold 10px Arial,sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(d.total), x + BAR_W / 2, cecorY - 4);
      }

      // Etiqueta X rotada
      ctx.save();
      ctx.fillStyle = "#64748b";
      ctx.font = "10px Arial,sans-serif";
      ctx.textAlign = "right";
      ctx.translate(x + BAR_W / 2, chartTop + CHART_H + 8);
      ctx.rotate((-40 * Math.PI) / 180);
      ctx.fillText(d.day, 0, 0);
      ctx.restore();
    });

    // Línea base
    ctx.strokeStyle = "#1e3048";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD + AXIS_L - 4, chartTop + CHART_H);
    ctx.lineTo(W - PAD - AXIS_R, chartTop + CHART_H);
    ctx.stroke();

    // Leyenda
    const lY = H - LEGEND_H + 8;
    let lx = PAD + AXIS_L;
    [
      { label: "PEXA", color: "#3b82f6" },
      { label: "CECOR", color: "#f59e0b" },
    ].forEach(({ label, color }) => {
      ctx.fillStyle = color;
      ctx.fillRect(lx, lY - 9, 12, 12);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px Arial,sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(label, lx + 16, lY);
      lx += 16 + ctx.measureText(label + "   ").width;
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

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="relative mb-4">
        <button
          type="button"
          onClick={copyAsImage}
          title="Copiar gráfica como imagen"
          className="absolute right-0 top-0 flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
          {copied ? "Copiada" : "Copiar imagen"}
        </button>
        <div className="text-center">
          <h2 className="text-base font-semibold text-text-primary">
            Dilación - Incidentes Pexa
          </h2>
          <div className="mt-1 flex flex-wrap items-baseline justify-center gap-3">
            <span className="font-mono text-xs">
              <span className="text-lg font-bold text-accent">{totalPexa}</span>{" "}
              <span className="text-text-muted">PEXA</span>
            </span>
            <span className="font-mono text-xs">
              <span className="text-lg font-bold text-warning">{totalCecor}</span>{" "}
              <span className="text-text-muted">CECOR</span>
            </span>
            <span className="font-mono text-xs">
              <span className="text-lg font-bold text-text-primary">{grandTotal}</span>{" "}
              <span className="text-text-muted">total</span>
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto h-56 max-w-2xl">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 8, bottom: 24, left: -8 }}
            barCategoryGap="30%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3048" />
            <XAxis
              dataKey="day"
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "#1e3048" }}
              interval={0}
              angle={-40}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "4px" }} />
            <Bar dataKey="PEXA" name="PEXA" stackId="dia" fill={COLORS.PEXA} fillOpacity={0.85} maxBarSize={36} />
            <Bar dataKey="CECOR" name="CECOR" stackId="dia" fill={COLORS.CECOR} fillOpacity={0.85} radius={[4, 4, 0, 0]} maxBarSize={36}>
              <LabelList
                dataKey="total"
                position="top"
                style={{ fill: "#e2e8f0", fontSize: 11, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
