import { getKPIs, getIncidentTrend } from "@/lib/queries/incidents";
import { getSLAMetrics } from "@/lib/queries/sla";
import { KPIGrid } from "@/components/dashboard/KPIGrid";
import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { SLAGauge } from "@/components/dashboard/SLAGauge";
import { IncidentsChart } from "@/components/dashboard/IncidentsChart";
import { TopCriticalTable } from "@/components/dashboard/TopCriticalTable";
import { LiveIndicator } from "@/components/dashboard/LiveIndicator";

export const dynamic = "force-dynamic";

const EMPTY_KPIS = {
  totalOpen: 0, criticalActive: 0, slaAtRisk: 0,
  closedToday: 0, lastSync: new Date().toISOString(),
};
const EMPTY_SLA = {
  global: { compliance: 100, total: 0, breached: 0, atRisk: 0 },
  byGroup: {
    PEXA:  { compliance: 100, total: 0, breached: 0 },
    CECOR: { compliance: 100, total: 0, breached: 0 },
  },
};

export default async function OverviewPage() {
  // Resiliente a fallos de DB — muestra datos vacíos en lugar de crashear
  const [kpis, sla, trend] = await Promise.all([
    getKPIs().catch(() => EMPTY_KPIS),
    getSLAMetrics().catch(() => EMPTY_SLA),
    getIncidentTrend().catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Overview</h1>
          <p className="mt-1 text-sm text-text-muted">
            Estado actual de operaciones
          </p>
        </div>
        <LiveIndicator lastSync={kpis.lastSync} />
      </div>

      <AlertBanner />

      <KPIGrid
        initial={{
          totalOpen: kpis.totalOpen,
          criticalActive: kpis.criticalActive,
          slaAtRisk: kpis.slaAtRisk,
          closedToday: kpis.closedToday,
          lastSync: kpis.lastSync,
        }}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SLAGauge initial={sla} />
        <IncidentsChart initial={trend} />
      </div>

      <TopCriticalTable />
    </div>
  );
}
