"use client";

import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

interface SLAData {
  global: { compliance: number; total: number; breached: number; atRisk: number };
  bySeverity: Record<string, { compliance: number; total: number; breached: number }>;
}

async function fetchSLA(): Promise<SLAData> {
  const res = await fetch("/api/sla");
  if (!res.ok) throw new Error("Error al obtener SLA");
  return res.json();
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f59e0b",
  MEDIUM: "#38bdf8",
  LOW: "#64748b",
};

interface SLAGaugeProps {
  initial: SLAData;
}

export function SLAGauge({ initial }: SLAGaugeProps) {
  const { data = initial } = useQuery<SLAData>({
    queryKey: ["sla"],
    queryFn: fetchSLA,
    initialData: initial,
    refetchInterval: 10_000,
  });

  const compliance = data.global.compliance;
  const gaugeData = [
    { name: "Cumplimiento", value: compliance },
    { name: "Incumplimiento", value: 100 - compliance },
  ];

  const complianceColor =
    compliance >= 90 ? "#22c55e" : compliance >= 70 ? "#f59e0b" : "#ef4444";

  const severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-4 text-base font-semibold text-text-primary">
        Cumplimiento SLA
      </h2>

      <div className="flex flex-col items-center gap-4 sm:flex-row">
        {/* Donut */}
        <div className="relative h-40 w-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={gaugeData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={68}
                startAngle={90}
                endAngle={-270}
                dataKey="value"
                strokeWidth={0}
              >
                <Cell fill={complianceColor} />
                <Cell fill="#1e3048" />
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#0d1526",
                  border: "1px solid #1e3048",
                  borderRadius: "6px",
                  color: "#e2e8f0",
                  fontSize: "12px",
                }}
                formatter={(v) => [`${Number(v).toFixed(1)}%`]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-2xl font-bold"
              style={{ color: complianceColor }}
            >
              {compliance}%
            </span>
            <span className="text-xs text-text-muted">Global</span>
          </div>
        </div>

        {/* Por severidad */}
        <div className="flex flex-1 flex-col gap-2 w-full">
          {severities.map((sev) => {
            const d = data.bySeverity[sev];
            if (!d) return null;
            return (
              <div key={sev} className="flex items-center gap-3">
                <span
                  className="w-16 shrink-0 text-xs font-medium"
                  style={{ color: SEVERITY_COLORS[sev] }}
                >
                  {sev}
                </span>
                <div className="relative h-2 flex-1 rounded-full bg-surface-elevated overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                    style={{
                      width: `${d.compliance}%`,
                      backgroundColor: SEVERITY_COLORS[sev],
                    }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-mono text-text-muted">
                  {d.compliance}%
                </span>
              </div>
            );
          })}

          <div className="mt-2 flex gap-4 text-xs text-text-muted">
            <span>Total: <b className="text-text-primary">{data.global.total}</b></span>
            <span>Breach: <b className="text-critical">{data.global.breached}</b></span>
            <span>En riesgo: <b className="text-warning">{data.global.atRisk}</b></span>
          </div>
        </div>
      </div>
    </div>
  );
}
