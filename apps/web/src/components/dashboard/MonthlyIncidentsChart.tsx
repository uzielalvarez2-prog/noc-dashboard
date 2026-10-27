"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { ArrowDown, ArrowUp } from "lucide-react";

export interface MonthlyIncidentPoint {
  month: string;
  label: string;
  total: number;
  changePct: number | null;
  isPartial: boolean;
  projectedTotal: number | null;
}

async function fetchMonthlyTrend(): Promise<MonthlyIncidentPoint[]> {
  const res = await fetch("/api/incidents/monthly-trend?group=PEXA");
  if (!res.ok) throw new Error("Error al obtener tendencia mensual");
  return res.json();
}

const BAR_COLOR = "#3b82f6";
const BAR_COLOR_PARTIAL = "#1e3048";

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

export function MonthlyIncidentsChart({ initial }: MonthlyIncidentsChartProps) {
  const { data } = useQuery<MonthlyIncidentPoint[]>({
    queryKey: ["monthly-incident-trend"],
    queryFn: fetchMonthlyTrend,
    placeholderData: initial,
    refetchInterval: 240_000,
  });

  const points = data ?? initial;
  const totalYTD = points.reduce((s, p) => s + p.total, 0);
  const current = points[points.length - 1];

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-text-primary">
          Incidentes por mes — PEXA (acumulado {new Date().getUTCFullYear()})
        </h2>
        <div className="flex items-baseline gap-4 font-mono text-xs">
          <span>
            <span className="text-lg font-bold text-text-primary">{totalYTD}</span>{" "}
            <span className="text-text-muted">total YTD</span>
          </span>
          {current?.isPartial && current.projectedTotal != null && (
            <span>
              <span className="text-lg font-bold text-accent">
                ~{current.projectedTotal}
              </span>{" "}
              <span className="text-text-muted">proy. {current.label}</span>
            </span>
          )}
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 20, right: 8, bottom: 0, left: -8 }}>
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
            />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(value, _name, props) => {
                const p = props.payload as MonthlyIncidentPoint;
                if (p.isPartial && p.projectedTotal != null) {
                  return [`${value} (proy. ~${p.projectedTotal})`, "Incidentes"];
                }
                return [value, "Incidentes"];
              }}
              labelFormatter={(label, payload) => {
                const p = payload?.[0]?.payload as MonthlyIncidentPoint | undefined;
                if (p?.isPartial) return `${label} (parcial, al día de hoy)`;
                return label;
              }}
            />
            <Bar dataKey="total" radius={[4, 4, 0, 0]}>
              {points.map((p) => (
                <Cell key={p.month} fill={p.isPartial ? BAR_COLOR_PARTIAL : BAR_COLOR} />
              ))}
              <LabelList
                dataKey="total"
                position="top"
                style={{ fill: "#e2e8f0", fontSize: 11 }}
              />
            </Bar>
          </BarChart>
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
