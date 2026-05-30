import { getSLAMetrics, getSLABreaches, getSLATrend } from "@/lib/queries/sla";
import { SLASeverityGauges } from "@/components/sla/SLASeverityGauges";
import { SLATrendChart } from "@/components/sla/SLATrendChart";
import { SLABreachTable } from "@/components/sla/SLABreachTable";
import { SLAGauge } from "@/components/dashboard/SLAGauge";
import type { Severity } from "@/types";

export const dynamic = "force-dynamic";

export default async function SLAPage() {
  const [metrics, breaches, trend] = await Promise.all([
    getSLAMetrics(),
    getSLABreaches(),
    getSLATrend(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">SLA</h1>
        <p className="mt-1 text-sm text-text-muted">
          Cumplimiento de niveles de servicio por severidad
        </p>
      </div>

      {/* Gauge global + gauges por severidad */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SLAGauge initial={metrics} />
        <div className="lg:col-span-2">
          <SLASeverityGauges bySeverity={metrics.bySeverity as Record<Severity, { compliance: number; total: number; breached: number }>} />
        </div>
      </div>

      {/* Trend chart 7 días */}
      <SLATrendChart data={trend} />

      {/* Tabla de brechas */}
      <SLABreachTable breaches={breaches as Parameters<typeof SLABreachTable>[0]["breaches"]} />
    </div>
  );
}
