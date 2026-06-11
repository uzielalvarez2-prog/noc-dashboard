import { cn } from "@/lib/utils";

const GROUP_COLORS: Record<string, { bar: string; text: string; bg: string }> = {
  PEXA:  { bar: "bg-accent",   text: "text-accent",   bg: "bg-accent/10"   },
  CECOR: { bar: "bg-warning",  text: "text-warning",  bg: "bg-warning/10"  },
};

interface GroupData {
  compliance: number;
  total: number;
  breached: number;
}

interface SLAGroupGaugesProps {
  byGroup: Record<string, GroupData>;
}

export function SLASeverityGauges({ byGroup }: SLAGroupGaugesProps) {
  const groups = Object.keys(byGroup);

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-muted">
        Sin datos de grupos disponibles
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {groups.map((group) => {
        const d = byGroup[group];
        const colors = GROUP_COLORS[group] ?? { bar: "bg-text-muted", text: "text-text-muted", bg: "bg-surface-elevated" };
        return (
          <div key={group} className={cn("rounded-lg border border-border p-4", colors.bg)}>
            <p className={cn("text-xs font-semibold uppercase tracking-wider", colors.text)}>
              {group}
            </p>

            <p className={cn("mt-2 text-4xl font-bold tabular-nums", colors.text)}>
              {d.compliance}%
            </p>
            <p className="text-xs text-text-muted">cumplimiento SLA</p>

            <div className="mt-3 h-1.5 w-full rounded-full bg-surface-elevated overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700", colors.bar)}
                style={{ width: `${d.compliance}%` }}
              />
            </div>

            <div className="mt-3 flex justify-between text-xs text-text-muted">
              <span>Total: <b className="text-text-primary">{d.total}</b></span>
              <span>Breach: <b className={d.breached > 0 ? "text-critical" : "text-text-primary"}>{d.breached}</b></span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
