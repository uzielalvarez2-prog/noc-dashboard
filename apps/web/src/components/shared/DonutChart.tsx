"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Camera, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/layout/ThemeProvider";
import { canvasPalette } from "@/lib/chartTheme";

export interface DonutDatum {
  name: string; // etiqueta de la leyenda (ya formateada)
  value: number;
  color: string;
}

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

// Dona reutilizable: anillo Recharts + total al centro + leyenda con conteo/% +
// botón "Imagen" que dibuja la dona en canvas y la copia al portapapeles (para
// mandarla por WhatsApp/correo). Fallback a descarga si el navegador no deja
// escribir imágenes al portapapeles.
export function DonutChart({
  title,
  data,
  centerLabel = "total",
  unitLabel = "incidentes",
  fileBase,
  legendMaxHeight = 260,
  bare = false,
}: {
  title: string;
  data: DonutDatum[];
  centerLabel?: string;
  unitLabel?: string;
  fileBase: string;
  legendMaxHeight?: number;
  /** Sin recuadro ni título propio: para anidar dentro de otra tarjeta que ya
   *  tiene su encabezado (el botón Imagen se muestra alineado a la derecha). */
  bare?: boolean;
}) {
  const { theme } = useTheme();
  const [imgCopied, setImgCopied] = useState(false);
  const total = data.reduce((s, d) => s + d.value, 0);

  async function onCopyImage() {
    const SCALE = 2;
    const W = 460;
    const PAD = 18;
    const TITLE_H = 44;
    const CX = 118;
    const CY = TITLE_H + 112;
    const R_OUT = 92;
    const R_IN = 58;
    const LEGEND_X = 244;
    const LINE_H = 20;
    const legendH = data.length * LINE_H;
    const totalH = Math.max(TITLE_H + 2 * 112 + PAD, TITLE_H + legendH + PAD * 2);

    const pal = canvasPalette(theme);
    const canvas = document.createElement("canvas");
    canvas.width = W * SCALE;
    canvas.height = totalH * SCALE;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, totalH);

    // Título
    ctx.fillStyle = pal.title;
    ctx.font = "bold 14px Arial,sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(title, PAD, 26);

    // Anillo
    let a0 = -Math.PI / 2; // empieza arriba
    const sum = total || 1;
    for (const d of data) {
      const frac = d.value / sum;
      const a1 = a0 + frac * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.arc(CX, CY, R_OUT, a0, a1);
      ctx.closePath();
      ctx.fillStyle = d.color;
      ctx.fill();
      a0 = a1;
    }
    // Hueco central (dona)
    ctx.beginPath();
    ctx.arc(CX, CY, R_IN, 0, Math.PI * 2);
    ctx.fillStyle = pal.bg;
    ctx.fill();

    // Total al centro
    ctx.fillStyle = pal.title;
    ctx.font = "bold 22px Arial,sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(total.toLocaleString("es-MX"), CX, CY + 2);
    ctx.fillStyle = pal.muted;
    ctx.font = "10px Arial,sans-serif";
    ctx.fillText(centerLabel.toUpperCase(), CX, CY + 18);

    // Leyenda
    ctx.textAlign = "left";
    data.forEach((d, i) => {
      const y = TITLE_H + i * LINE_H + 4;
      ctx.fillStyle = d.color;
      ctx.fillRect(LEGEND_X, y, 10, 10);
      const pct = total ? Math.round((d.value / total) * 100) : 0;
      ctx.fillStyle = pal.text;
      ctx.font = "11px Arial,sans-serif";
      const name = d.name.length > 20 ? d.name.slice(0, 18) + "…" : d.name;
      ctx.fillText(`${name}`, LEGEND_X + 16, y + 9);
      ctx.textAlign = "right";
      ctx.fillStyle = pal.muted;
      ctx.fillText(`${d.value} · ${pct}%`, W - PAD, y + 9);
      ctx.textAlign = "left";
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

  const imgBtn = (
    <button
      type="button"
      onClick={onCopyImage}
      title="Copiar la gráfica como imagen"
      className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-accent"
    >
      {imgCopied ? <Check className="h-3.5 w-3.5 text-success" /> : <Camera className="h-3.5 w-3.5" />}
      {imgCopied ? "Copiada" : "Imagen"}
    </button>
  );

  const body = (
    <>
      {data.length === 0 ? (
        <p className="py-8 text-center text-xs text-text-muted">Sin datos</p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <div className="relative h-52 w-52 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={90}
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value, _name, item) => {
                    const n = typeof value === "number" ? value : Number(value) || 0;
                    const pct = total ? Math.round((n / total) * 100) : 0;
                    const key = String((item as { payload?: { name?: string } })?.payload?.name ?? "");
                    return [`${n} ${unitLabel} (${pct}%)`, key];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-text-primary">{total.toLocaleString("es-MX")}</span>
              <span className="text-[10px] uppercase tracking-wider text-text-muted">{centerLabel}</span>
            </div>
          </div>

          <div
            className={cn("grid w-full max-w-xs grid-cols-1 gap-1.5 overflow-y-auto pr-1")}
            style={{ maxHeight: legendMaxHeight }}
          >
            {data.map((d) => {
              const pct = total ? Math.round((d.value / total) * 100) : 0;
              return (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
                  <span className="flex-1 truncate text-text-primary" title={d.name}>{d.name}</span>
                  <span className="font-mono font-semibold text-text-primary">{d.value}</span>
                  <span className="w-9 text-right font-mono text-text-muted">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  // Modo anidado: solo el botón Imagen arriba a la derecha + el cuerpo, sin
  // recuadro ni título (la tarjeta contenedora ya los pone).
  if (bare) {
    return (
      <div>
        <div className="mb-2 flex justify-end">{imgBtn}</div>
        {body}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-surface/60 p-4 backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {imgBtn}
      </div>
      {body}
    </div>
  );
}
