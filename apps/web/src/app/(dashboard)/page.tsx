import { getKPIs, getIncidentTrend, type TrendPoint } from "@/lib/queries/incidents";
import { getSLAMetrics } from "@/lib/queries/sla";
import { KPIGrid } from "@/components/dashboard/KPIGrid";
import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { SLAGauge } from "@/components/dashboard/SLAGauge";
import { IncidentsChart } from "@/components/dashboard/IncidentsChart";
import { TopCriticalTable } from "@/components/dashboard/TopCriticalTable";
import { LiveIndicator } from "@/components/dashboard/LiveIndicator";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [kpis, sla, trend] = await Promise.all([
    getKPIs(),
    getSLAMetrics(),
    getIncidentTrend(),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Overview</h1>
          <p className="mt-1 text-sm text-text-muted">
            Estado actual de operaciones
          </p>
        </div>
        <LiveIndicator lastSync={kpis.lastSync} />
      </div>

      {/* Alertas críticas — solo si hay incidentes críticos */}
      <AlertBanner />

      {/* KPI Cards */}
      <KPIGrid
        initial={{
          totalOpen: kpis.totalOpen,
          criticalActive: kpis.criticalActive,
          slaAtRisk: kpis.slaAtRisk,
          closedToday: kpis.closedToday,
          lastSync: kpis.lastSync,
        }}
      />

      {/* SLA Gauge + Chart en grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SLAGauge initial={sla} />
        <IncidentsChart initial={trend} />
      </div>

      {/* Top críticos */}
      <TopCriticalTable />
    </div>
  );
}
