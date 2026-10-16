"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp } from "lucide-react";
import type { ClosedStats } from "@/types/closed";
import { DonutChart, type DonutDatum } from "@/components/shared/DonutChart";
import { cn } from "@/lib/utils";

// Paleta en tonos: azul → cian → verde → ámbar → naranja, un color por porción.
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
  "#818cf8", // índigo
  "#2dd4bf", // teal
  "#facc15", // amarillo
  "#f87171", // rojo claro
];

function toDonut(rows: { name: string; count: number }[], labelFn?: (name: string) => string): DonutDatum[] {
  return rows.map((r, i) => ({
    name: labelFn ? labelFn(r.name) : r.name,
    value: r.count,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));
}

// Para Semana/Día (muchas categorías): toma las `topN` mayores y agrupa el resto
// en una rebanada "Otros", para que la dona sea legible sin perder el total. Las
// filas vienen cronológicas; se ordenan por conteo para elegir las top.
const OTROS_COLOR = "#64748b";
function toDonutTop(
  rows: { name: string; count: number }[],
  labelFn: (name: string) => string,
  topN = 12
): DonutDatum[] {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, topN);
  const resto = sorted.slice(topN);
  const out: DonutDatum[] = top.map((r, i) => ({
    name: labelFn(r.name),
    value: r.count,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));
  if (resto.length) {
    out.push({
      name: `Otros (${resto.length})`,
      value: resto.reduce((s, r) => s + r.count, 0),
      color: OTROS_COLOR,
    });
  }
  return out;
}

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
        ) : (
          // Dona siempre. Mes: todas las porciones (son pocas). Semana/Día: top 12
          // + "Otros" para que no sea un arcoíris ilegible.
          <DonutChart
            title=""
            bare
            data={
              bucket === "month"
                ? toDonut(periods, (n) => periodLabel(n, "month"))
                : toDonutTop(periods, (n) => periodLabel(n, bucket))
            }
            centerLabel="total"
            unitLabel="incidentes"
            fileBase={`cecor-volumen-${bucket}-${group.toLowerCase()}`}
          />
        )}
      </div>

      {/* Causa raíz + productividad como donas (con botón Copiar imagen). */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DonutChart
          title="Causa raíz (Res Analyst Code)"
          data={toDonut(stats?.byCause ?? [])}
          centerLabel="cerrados"
          unitLabel="cerrados"
          fileBase={`cecor-causa-${group.toLowerCase()}`}
        />
        <DonutChart
          title="Productividad por analista"
          data={toDonut(stats?.byUser ?? [])}
          centerLabel="cerrados"
          unitLabel="cerrados"
          fileBase={`cecor-analista-${group.toLowerCase()}`}
        />
      </div>
    </div>
  );
}
