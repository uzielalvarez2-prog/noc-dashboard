import { cn } from "@/lib/utils";
import { User } from "lucide-react";
import type { OperatorStats } from "@/lib/queries/operators";

function statusColor(status: string): string {
  if (status.includes("RESOLVED")) return "text-success";
  if (status.includes("PROGRESS")) return "text-warning";
  if (status.includes("PENDING")) return "text-accent";
  return "text-text-muted";
}

export function OperatorCard({ op }: { op: OperatorStats }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5 transition-colors hover:bg-surface-elevated">
      {/* Header: login + en línea + grupos */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated">
            <User className="h-4 w-4 text-text-muted" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-success" />
          </div>
          <div>
            <p className="font-mono text-sm font-semibold text-text-primary">{op.login}</p>
            <p className="text-[10px] uppercase tracking-wider text-success">en línea</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {op.groups.map((g) => (
            <span
              key={g}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                g === "PEXA" ? "bg-accent/15 text-accent" : "bg-warning/15 text-warning"
              )}
            >
              {g}
            </span>
          ))}
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-sm font-bold",
              op.openCount > 5 ? "bg-warning/15 text-warning" : "bg-surface-elevated text-text-primary"
            )}
          >
            {op.openCount}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="my-3 h-px bg-border" />

      {/* Desglose por estatus */}
      <div className="space-y-1.5">
        {op.statuses.map((s) => (
          <div key={s.status} className="flex items-center justify-between gap-2">
            <span className={cn("truncate text-xs font-medium", statusColor(s.status))}>
              {s.status}
            </span>
            <span className="shrink-0 font-mono text-xs font-semibold text-text-primary">
              {s.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
