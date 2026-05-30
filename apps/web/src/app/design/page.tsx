import { KPICard } from "@/components/dashboard/KPICard";
import { SeverityBadge } from "@/components/incidents/SeverityBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function DesignPage() {
  const colors = [
    { name: "background", hex: "#060d1a", token: "--background" },
    { name: "surface", hex: "#0d1526", token: "--surface" },
    { name: "surface-elevated", hex: "#152032", token: "--surface-elevated" },
    { name: "border", hex: "#1e3048", token: "--border" },
    { name: "text-primary", hex: "#e2e8f0", token: "--text-primary" },
    { name: "text-muted", hex: "#64748b", token: "--text-muted" },
    { name: "accent", hex: "#3b82f6", token: "--accent" },
    { name: "critical", hex: "#ef4444", token: "--critical" },
    { name: "critical-dim", hex: "#1f1315", token: "--critical-dim" },
    { name: "warning", hex: "#f59e0b", token: "--warning" },
    { name: "warning-dim", hex: "#1c1609", token: "--warning-dim" },
    { name: "success", hex: "#22c55e", token: "--success" },
    { name: "success-dim", hex: "#0b1a0f", token: "--success-dim" },
    { name: "info", hex: "#38bdf8", token: "--info" },
  ];

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-5xl space-y-10">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            NOC Dashboard — Design System
          </h1>
          <p className="mt-1 font-mono text-xs text-text-muted">Step 2 ✓</p>
        </div>

        {/* Colors */}
        <section>
          <h2 className="mb-4 text-xl font-semibold text-text-primary">
            Paleta de Colores
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {colors.map((c) => (
              <div
                key={c.token}
                className="rounded-lg border border-border bg-surface p-3"
              >
                <div
                  className="mb-2 h-10 w-full rounded"
                  style={{ backgroundColor: c.hex }}
                />
                <p className="text-xs font-medium text-text-primary">
                  {c.name}
                </p>
                <p className="font-mono text-xs text-text-muted">{c.hex}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Typography */}
        <section>
          <h2 className="mb-4 text-xl font-semibold text-text-primary">
            Tipografía
          </h2>
          <div className="rounded-lg border border-border bg-surface p-6 space-y-3">
            <p className="text-2xl font-bold text-text-primary">H1 — Inter 700 24px</p>
            <p className="text-xl font-semibold text-text-primary">H2 — Inter 600 20px</p>
            <p className="text-base font-semibold text-text-primary">H3 — Inter 600 16px</p>
            <p className="text-sm text-text-primary">Body — Inter 400 14px</p>
            <p className="text-xs text-text-muted">Body Small — Inter 400 12px</p>
            <p className="text-4xl font-bold text-text-primary tabular-nums">42</p>
            <p className="text-xs text-text-muted">↑ KPI Number — Inter 700 32px</p>
            <p className="font-mono text-xs text-text-muted">
              IM1234567 — 2026-05-30 14:32:00 (JetBrains Mono 12px)
            </p>
          </div>
        </section>

        {/* Severity Badges */}
        <section>
          <h2 className="mb-4 text-xl font-semibold text-text-primary">
            Badges de Severidad
          </h2>
          <div className="flex flex-wrap gap-3">
            <SeverityBadge severity="CRITICAL" />
            <SeverityBadge severity="HIGH" />
            <SeverityBadge severity="MEDIUM" />
            <SeverityBadge severity="LOW" />
          </div>
        </section>

        {/* KPI Cards */}
        <section>
          <h2 className="mb-4 text-xl font-semibold text-text-primary">
            KPI Cards
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KPICard
              title="Total Abiertos"
              value={284}
              subtitle="incidentes activos"
              trend="up"
              trendValue="+12 última hora"
              status="neutral"
            />
            <KPICard
              title="Críticos Activos"
              value={7}
              subtitle="requieren atención"
              trend="up"
              trendValue="+2 últimos 10 min"
              status="critical"
            />
            <KPICard
              title="SLA en Riesgo"
              value={23}
              subtitle="vencen en &lt;2h"
              trend="down"
              trendValue="-5 vs ayer"
              status="warning"
            />
            <KPICard
              title="Cerrados Hoy"
              value={142}
              subtitle="incidentes resueltos"
              trend="up"
              trendValue="+18 vs ayer"
              status="success"
            />
          </div>
        </section>

        {/* Buttons & shadcn/ui */}
        <section>
          <h2 className="mb-4 text-xl font-semibold text-text-primary">
            shadcn/ui Componentes
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button variant="default">Acción primaria</Button>
            <Button variant="secondary">Secundario</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="destructive">Destructivo</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
        </section>
      </div>
    </div>
  );
}
