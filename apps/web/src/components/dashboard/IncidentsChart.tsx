"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface TrendPoint {
  hour: string;
  PEXA: number;
  CECOR: number;
}

interface KPIData {
  trend: TrendPoint[];
}

async function fetchKPIs(): Promise<KPIData> {
  const res = await fetch("/api/kpis");
  if (!res.ok) throw new Error("Error al obtener KPIs");
  return res.json();
}

const COLORS = {
  PEXA: "#3b82f6",
  CECOR: "#f59e0b",
};

interface IncidentsChartProps {
  initial: TrendPoint[];
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

export function IncidentsChart({ initial }: IncidentsChartProps) {
  const { data } = useQuery<KPIData>({
    queryKey: ["kpis"],
    queryFn: fetchKPIs,
    placeholderData: { trend: initial },
    refetchInterval: 10_000,
  });

  const chartData = data?.trend ?? initial;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-4 text-base font-semibold text-text-primary">
        Abiertos por hora — últimas 24h
      </h2>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 4, right: 8, bottom: 0, left: -8 }}
          >
            <defs>
              {(Object.keys(COLORS) as (keyof typeof COLORS)[]).map((key) => (
                <linearGradient
                  key={key}
                  id={`grad-${key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={COLORS[key]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS[key]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3048" />
            <XAxis
              dataKey="hour"
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#1e3048" }}
              interval={3}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend
              wrapperStyle={{ fontSize: "12px", color: "#64748b", paddingTop: "8px" }}
            />
            {(Object.keys(COLORS) as (keyof typeof COLORS)[]).map((key) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={COLORS[key]}
                strokeWidth={1.5}
                fill={`url(#grad-${key})`}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
