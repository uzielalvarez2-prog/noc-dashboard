"use client";

import {
  Bar, XAxis, YAxis, CartesianGrid, Legend, LabelList,
  Tooltip, ResponsiveContainer, Line, ComposedChart,
} from "recharts";

interface TrendPoint {
  day: string;
  compliance: number;
  breached: number;
  total: number;
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

export function SLATrendChart({ data }: { data: TrendPoint[] }) {
  // Barras apiladas: cumplidos (verde) + vencidos (rojo) = total del día
  const chartData = data.map((d) => ({
    ...d,
    cumplidos: d.total - d.breached,
  }));

  const total7d = data.reduce((s, d) => s + d.total, 0);
  const breached7d = data.reduce((s, d) => s + d.breached, 0);
  const compliance7d =
    total7d > 0 ? Math.round(((total7d - breached7d) / total7d) * 100) : 100;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-text-primary">
          Tendencia SLA — últimos 7 días
        </h2>
        <div className="flex items-baseline gap-3 font-mono text-xs">
          <span>
            <span className="text-lg font-bold text-text-primary">{total7d}</span>{" "}
            <span className="text-text-muted">cerrados</span>
          </span>
          <span>
            <span className="text-lg font-bold text-success">{total7d - breached7d}</span>{" "}
            <span className="text-text-muted">en SLA</span>
          </span>
          <span>
            <span className="text-lg font-bold text-critical">{breached7d}</span>{" "}
            <span className="text-text-muted">vencidos</span>
          </span>
          <span>
            <span
              className={`text-lg font-bold ${
                compliance7d >= 90
                  ? "text-success"
                  : compliance7d >= 70
                  ? "text-warning"
                  : "text-critical"
              }`}
            >
              {compliance7d}%
            </span>{" "}
            <span className="text-text-muted">cumplimiento</span>
          </span>
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 16, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3048" />
            <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#1e3048" }} />
            <YAxis yAxisId="pct" domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} unit="%" />
            <YAxis yAxisId="cnt" orientation="right" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(v, name) =>
                name === "% cumplimiento" ? [`${v}%`, name] : [v, name]
              }
            />
            <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
            <Bar yAxisId="cnt" dataKey="cumplidos" stackId="dia" fill="#22c55e" fillOpacity={0.55} name="En SLA" />
            <Bar yAxisId="cnt" dataKey="breached" stackId="dia" fill="#ef4444" fillOpacity={0.75} radius={[3, 3, 0, 0]} name="Vencidos">
              <LabelList
                dataKey="total"
                position="top"
                style={{ fill: "#e2e8f0", fontSize: 11, fontWeight: 600 }}
              />
            </Bar>
            <Line yAxisId="pct" type="monotone" dataKey="compliance" stroke="#38bdf8" strokeWidth={2} dot={{ fill: "#38bdf8", r: 3 }} name="% cumplimiento" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Barras = incidentes cerrados por día (verde dentro de SLA 4h, rojo vencidos), con el
        total del día encima. Línea azul = % de cumplimiento diario.
      </p>
    </div>
  );
}
