"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { ClosedStats } from "@/types/closed";
import { ClosedRanking } from "@/components/closed/ClosedRanking";
import { cn } from "@/lib/utils";

// Paleta en tonos: azul → cian → verde → ámbar → naranja, un color por mes.
const DONUT_COLORS = [
  "#3b82f6", // azul
  "#06b6d4", // cian
  "#22c55e", // verde
  "#a3e635", // lima
  "#f59e0b", // ámbar
  "#fb923c", // naranja
  "#f472b6", // rosa
  "#a78bfa", // violeta
  "#38bdf8", // celeste
  "#34d399", // esmeralda
  "#fbbf24", // dorado
  "#fb7185", // coral
];

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

// ─────────────────────────────────────────────────────────────────────────────
// Sub-pestaña "Estadísticas" de la vista CECOR (Incidentes abiertos → CECOR).
// Se alimenta del histórico de CERRADOS (ClosedIncident, que el scraper acumula
// cada noche), filtrado al grupo del tab. Responde: volumen por mes/semana/día,
// causa raíz, tiempo de resolución y productividad por analista.
//
// El volumen por periodo se mide por hora de APERTURA (cuántos se GENERARON),
// aunque la fuente sea la tabla de cerrados.
// ─────────────────────────────────────────────────────────────────────────────

type Bucket = "month" | "week" | "day";

async function fetchStats(group: string, bucket: Bucket): Promise<ClosedStats> {
  const p = new URLSearchParams();
  p.set("group", group);
  p.set("bucket", bucket);
  // Histórico completo: sin filtro de fechas.
  const res = await fetch(`/api/incidents/closed/stats?${p.toString()}`);
  if (!res.ok) throw new Error("Error al obtener estadística");
  return res.json();
}

function fmtMins(mins: number): string {
  if (!mins) return "—";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// Etiqueta legible del periodo: "2026-08" → "Ago 2026"; semana/día tal cual.
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
function periodLabel(key: string, bucket: Bucket): string {
  if (bucket === "month") {
    const [y, m] = key.split("-");
    return `${MESES[+m - 1] ?? m} ${y}`;
  }
  if (bucket === "week") return key.replace("-W", " · sem ");
  return key; // day
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface/60 p-4">
      <p className="text-[11px] uppercase tracking-wider text-text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold",
          tone === "ok" ? "text-success" : tone === "bad" ? "text-critical" : "text-text-primary"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-text-muted/70">{hint}</p>}
    </div>
  );
}

export function CecorEstadisticas({ group }: { group: "PEXA" | "CECOR" }) {
  const [bucket, setBucket] = useState<Bucket>("month");

  const { data: stats, isLoading } = useQuery<ClosedStats>({
    queryKey: ["cecor-stats", group, bucket],
    queryFn: () => fetchStats(group, bucket),
    refetchInterval: 600_000,
  });

  const bucketBtn = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
      active ? "bg-accent text-white" : "border border-border text-text-muted hover:text-text-primary"
    );

  const periods = stats?.byPeriod ?? [];
  const maxPeriod = Math.max(1, ...periods.map((p) => p.count));
  const totalPeriods = periods.reduce((s, p) => s + p.count, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-xs text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando estadística histórica…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Incidentes (histórico)" value={(stats?.total ?? 0).toLocaleString("es-MX")} hint="cerrados en la base" />
        <Kpi
          label="SLA 4 h"
          value={`${stats?.compliance ?? 0}%`}
          hint={`${stats?.cumplidos ?? 0} ok · ${stats?.vencidos ?? 0} vencidos`}
          tone={(stats?.compliance ?? 0) >= 80 ? "ok" : "bad"}
        />
        <Kpi label="Resolución promedio" value={fmtMins(stats?.avgResolutionMins ?? 0)} hint={`mediana ${fmtMins(stats?.medianResolutionMins ?? 0)}`} />
        <Kpi label="Causas distintas" value={String(stats?.byCause.length ?? 0)} hint={`${stats?.byUser.length ?? 0} analistas`} />
      </div>

      {/* Volumen por periodo */}
      <div className="rounded-xl border border-border/60 bg-surface/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
            <TrendingUp className="h-4 w-4 text-accent" />
            Incidentes generados por {bucket === "month" ? "mes" : bucket === "week" ? "semana" : "día"}
          </h3>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setBucket("month")} className={bucketBtn(bucket === "month")}>Mes</button>
            <button type="button" onClick={() => setBucket("week")} className={bucketBtn(bucket === "week")}>Semana</button>
            <button type="button" onClick={() => setBucket("day")} className={bucketBtn(bucket === "day")}>Día</button>
          </div>
        </div>

        {periods.length === 0 ? (
          <p className="py-8 text-center text-xs text-text-muted">Sin datos. ¿Ya se cargó el histórico de cerrados?</p>
        ) : bucket === "month" ? (
          // Mes → dona con tonos (pocas porciones, se lee bien). El centro muestra
          // el total; la leyenda lateral lista cada mes con su conteo y %.
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center">
            <div className="relative h-52 w-52 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={periods}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={90}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {periods.map((p, i) => (
                      <Cell key={p.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value, _name, item) => {
                      const n = typeof value === "number" ? value : Number(value) || 0;
                      const pct = totalPeriods ? Math.round((n / totalPeriods) * 100) : 0;
                      const key = String((item as { payload?: { name?: string } })?.payload?.name ?? "");
                      return [`${n} incidentes (${pct}%)`, periodLabel(key, bucket)];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Total al centro de la dona */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-text-primary">{totalPeriods.toLocaleString("es-MX")}</span>
                <span className="text-[10px] uppercase tracking-wider text-text-muted">total</span>
              </div>
            </div>
            {/* Leyenda */}
            <div className="grid w-full max-w-xs grid-cols-1 gap-1.5">
              {periods.map((p, i) => {
                const pct = totalPeriods ? Math.round((p.count / totalPeriods) * 100) : 0;
                return (
                  <div key={p.name} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                    />
                    <span className="flex-1 text-text-primary">{periodLabel(p.name, bucket)}</span>
                    <span className="font-mono font-semibold text-text-primary">{p.count}</span>
                    <span className="w-9 text-right font-mono text-text-muted">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // Semana/Día → muchas categorías: barras horizontales (la dona sería ilegible).
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {periods.map((p) => (
              <div key={p.name} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-right text-xs text-text-muted" title={p.name}>
                  {periodLabel(p.name, bucket)}
                </span>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-surface-elevated/60">
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-accent/60 transition-all duration-500"
                    style={{ width: `${(p.count / maxPeriod) * 100}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right font-mono text-xs font-semibold text-text-primary">
                  {p.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rankings: causa raíz + productividad (reusan el componente de cerrados) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ClosedRanking
          title="Causa raíz (Res Analyst Code)"
          dimensionLabel="Causa"
          rows={stats?.byCause ?? []}
          fileBase={`cecor-causa-${group.toLowerCase()}`}
          variant="cause"
        />
        <ClosedRanking
          title="Productividad por analista"
          dimensionLabel="Analista"
          rows={stats?.byUser ?? []}
          fileBase={`cecor-analista-${group.toLowerCase()}`}
          variant="analyst"
        />
      </div>
    </div>
  );
}
