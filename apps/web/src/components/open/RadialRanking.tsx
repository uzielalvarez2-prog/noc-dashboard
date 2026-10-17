"use client";

import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Download, Loader2 } from "lucide-react";
import type { TopRow } from "@/types/open";

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

// 6 colores bien separados (la paleta de las barras repite naranjas).
const RING_COLORS = ["#38bdf8", "#f59e0b", "#a78bfa", "#34d399", "#fb7185", "#e879f9"];

interface RingDatum {
  name: string;
  value: number;
  fill: string;
}

// Ranking en anillos concéntricos (estilo "actividad"): el estado/distrito con
// más incidentes es el anillo exterior y más largo. Solo los primeros `ringCount`
// llevan anillo (más se vuelve ilegible); la lista de la derecha muestra TODOS y
// cada fila baja el Excel de ese estado/distrito.
export function RadialRanking({
  rows,
  total,
  ringCount = RING_COLORS.length,
  loadingName,
  onSelect,
  dimensionLabel,
}: {
  rows: TopRow[]; // ya ordenadas de mayor a menor
  total: number;
  ringCount?: number;
  loadingName: string | null;
  onSelect: (name: string) => void;
  dimensionLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-xs text-text-muted">Sin datos</p>;
  }

  const max = Math.max(1, rows[0].incidents);
  // Recharts dibuja el primer dato en el anillo interior: se invierte para que
  // el mayor quede afuera.
  const rings: RingDatum[] = rows
    .slice(0, ringCount)
    .map((r, i) => ({ name: r.name, value: r.incidents, fill: RING_COLORS[i % RING_COLORS.length] }))
    .reverse();

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center">
      <div className="relative h-56 w-56 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            data={rings}
            innerRadius="34%"
            outerRadius="100%"
            barSize={10}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, max]} tick={false} axisLine={false} />
            <RadialBar
              dataKey="value"
              background={{ fill: "rgba(148,163,184,0.12)" }}
              cornerRadius={6}
              onClick={(d: { name?: string }) => {
                if (d.name) onSelect(d.name);
              }}
              style={{ cursor: "pointer" }}
            />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(value, _name, item) => {
                const n = typeof value === "number" ? value : Number(value) || 0;
                const pct = total ? Math.round((n / total) * 100) : 0;
                const key = String((item as { payload?: { name?: string } })?.payload?.name ?? "");
                return [`${n} incidentes (${pct}%)`, key];
              }}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold leading-none text-text-primary">{total.toLocaleString("es-MX")}</span>
          <span className="mt-0.5 text-[9px] uppercase tracking-wider text-text-muted">incidentes</span>
        </div>
      </div>

      <div className="max-h-56 w-full max-w-xs space-y-0.5 overflow-y-auto pr-1">
        {rows.map((r, i) => {
          const inRing = i < ringCount;
          const color = inRing ? RING_COLORS[i % RING_COLORS.length] : "#64748b";
          const pct = total ? Math.round((r.incidents / total) * 100) : 0;
          const isLoading = loadingName === r.name;
          return (
            <button
              key={r.name}
              type="button"
              onClick={() => onSelect(r.name)}
              disabled={isLoading}
              title={`Descargar Excel de ${r.name}`}
              className="group flex w-full items-center gap-2 rounded px-1 py-0.5 text-xs transition-colors hover:bg-surface-elevated/50"
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
              ) : (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              )}
              <span className="flex-1 truncate text-left text-text-primary">{r.name}</span>
              <Download className="h-3 w-3 shrink-0 text-text-muted/0 transition-colors group-hover:text-accent" />
              <span className="font-mono font-semibold" style={{ color }}>{r.incidents}</span>
              <span className="w-9 text-right font-mono text-text-muted">{pct}%</span>
            </button>
          );
        })}
        <p className="pt-1 text-[11px] text-text-muted/70">
          Clic en un anillo o fila para bajar el Excel de ese {dimensionLabel.toLowerCase()}.
        </p>
      </div>
    </div>
  );
}
