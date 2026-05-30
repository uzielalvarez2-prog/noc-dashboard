"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
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
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-4 text-base font-semibold text-text-primary">
        Tendencia SLA — últimos 7 días
      </h2>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3048" />
            <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#1e3048" }} />
            <YAxis yAxisId="pct" domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} unit="%" />
            <YAxis yAxisId="cnt" orientation="right" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => name === "compliance" ? [`${v}%`, "Cumplimiento"] : [v, name === "breached" ? "Breach" : "Total"]} />
            <Bar yAxisId="cnt" dataKey="breached" fill="#1f1315" stroke="#ef4444" strokeWidth={1} radius={[2, 2, 0, 0]} name="breached" />
            <Line yAxisId="pct" type="monotone" dataKey="compliance" stroke="#22c55e" strokeWidth={2} dot={{ fill: "#22c55e", r: 3 }} name="compliance" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
