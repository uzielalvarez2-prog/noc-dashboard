"use client";

import { useQuery } from "@tanstack/react-query";
import { DonutChart, type DonutDatum } from "@/components/shared/DonutChart";

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

// Dilación: el día más antiguo en rojo, el más reciente en verde (los datos
// vienen cronológicos, del más viejo al más nuevo).
function ageColor(i: number, n: number): string {
  const t = n > 1 ? i / (n - 1) : 1;
  return `hsl(${Math.round(t * 140)}, 75%, 55%)`;
}

interface Props {
  initial: DayPoint[];
}

export function OpenByDayChart({ initial }: Props) {
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

  const slices: DonutDatum[] = chartData.map((d, i) => ({
    name: d.day,
    value: d.total,
    color: ageColor(i, chartData.length),
  }));

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-2 text-center">
        <h2 className="text-base font-semibold text-text-primary">Dilación - Incidentes Pexa</h2>
        <div className="mt-1 flex flex-wrap items-baseline justify-center gap-3">
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
        <p className="mt-1 text-[11px] text-text-muted">Por día de apertura · rojo = más antiguo, verde = más reciente</p>
      </div>

      <DonutChart
        bare
        title="Dilación - Incidentes Pexa"
        data={slices}
        centerLabel="abiertos"
        unitLabel="incidentes"
        fileBase="incidentes-por-dia"
        legendMaxHeight={220}
      />
    </div>
  );
}
