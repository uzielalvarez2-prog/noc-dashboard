"use client";

import { useRef, useState } from "react";
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
  const chartRef = useRef<HTMLDivElement>(null);
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
    const container = chartRef.current;
    if (!container) return;
    const svg = container.querySelector("svg");
    if (!svg) return;

    const { width, height } = svg.getBoundingClientRect();
    const titleH = 52;
    const pad = 16;
    const scale = 2;

    const svgStr = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.src = svgUrl;
    await new Promise<void>((resolve) => { img.onload = () => resolve(); });

    const canvas = document.createElement("canvas");
    canvas.width = (width + pad * 2) * scale;
    canvas.height = (height + titleH + pad) * scale;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);

    // Fondo
    ctx.fillStyle = "#0d1526";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Título
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 14px Arial,sans-serif";
    ctx.fillText("Incidentes por día", pad, 22);

    // Total
    const titleW = ctx.measureText("Incidentes por día  ").width;
    ctx.fillStyle = "#60a5fa";
    ctx.font = "bold 22px Arial,sans-serif";
    ctx.fillText(String(grandTotal), pad + titleW, 26);
    ctx.fillStyle = "#64748b";
    ctx.font = "11px Arial,sans-serif";
    const totalW = ctx.measureText(String(grandTotal) + "  ").width;
    ctx.fillText("total", pad + titleW + totalW, 24);

    // Gráfica SVG
    ctx.drawImage(img, pad, titleH, width, height);
    URL.revokeObjectURL(svgUrl);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // fallback: descarga la imagen
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "incidentes-por-dia.png";
        a.click();
      }
    }, "image/png");
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-base font-semibold text-text-primary">
            Incidentes por día
          </h2>
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
        <button
          type="button"
          onClick={copyAsImage}
          title="Copiar gráfica como imagen"
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
          {copied ? "Copiada" : "Copiar imagen"}
        </button>
      </div>

      <div ref={chartRef} className="mx-auto h-56 max-w-2xl">
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
