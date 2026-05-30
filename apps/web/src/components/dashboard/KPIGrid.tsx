"use client";

import { useQuery } from "@tanstack/react-query";
import { KPICard } from "./KPICard";
import { AlertTriangle, Activity, Clock, CheckCircle } from "lucide-react";

interface KPIData {
  totalOpen: number;
  criticalActive: number;
  slaAtRisk: number;
  closedToday: number;
  lastSync: string;
}

async function fetchKPIs(): Promise<KPIData> {
  const res = await fetch("/api/kpis");
  if (!res.ok) throw new Error("Error al obtener KPIs");
  return res.json();
}

interface KPIGridProps {
  initial: KPIData;
}

export function KPIGrid({ initial }: KPIGridProps) {
  const { data = initial } = useQuery<KPIData>({
    queryKey: ["kpis"],
    queryFn: fetchKPIs,
    initialData: initial,
    refetchInterval: 10_000,
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KPICard
        title="Total Abiertos"
        value={data.totalOpen}
        subtitle="incidentes activos"
        status="neutral"
        icon={<Activity className="h-4 w-4" />}
      />
      <KPICard
        title="Críticos Activos"
        value={data.criticalActive}
        subtitle="requieren atención inmediata"
        status={data.criticalActive > 0 ? "critical" : "success"}
        icon={<AlertTriangle className="h-4 w-4" />}
      />
      <KPICard
        title="SLA en Riesgo"
        value={data.slaAtRisk}
        subtitle="vencen pronto"
        status={data.slaAtRisk > 0 ? "warning" : "success"}
        icon={<Clock className="h-4 w-4" />}
      />
      <KPICard
        title="Cerrados Hoy"
        value={data.closedToday}
        subtitle="incidentes resueltos"
        status="success"
        icon={<CheckCircle className="h-4 w-4" />}
      />
    </div>
  );
}
