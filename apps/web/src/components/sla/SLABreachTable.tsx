import Link from "next/link";
import { SeverityBadge } from "@/components/incidents/SeverityBadge";
import { formatDate } from "@/lib/utils";
import type { Severity } from "@/types";

interface BreachRow {
  id: string;
  title: string;
  severity: Severity;
  status: string;
  assignedTo: string | null;
  slaDeadline: Date | string;
  createdAt: Date | string;
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierto", IN_PROGRESS: "En progreso", RESOLVED: "Resuelto", CLOSED: "Cerrado",
};

export function SLABreachTable({ breaches }: { breaches: BreachRow[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-base font-semibold text-text-primary">
          Incidentes con SLA Vencido
        </h2>
        <span className="rounded-full bg-critical-dim px-2 py-0.5 font-mono text-xs text-critical">
          {breaches.length} breach{breaches.length !== 1 ? "es" : ""}
        </span>
      </div>

      {breaches.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-success">
          Sin incidentes con SLA vencido
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-elevated">
                {["ID", "Título", "Severidad", "Estado", "Asignado", "Deadline SLA", "Abierto"].map((h) => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {breaches.map((row) => (
                <tr key={row.id} className="border-b border-border bg-critical-dim/30 hover:bg-critical-dim/60 transition-colors">
                  <td className="px-4 py-2">
                    <Link href={`/incidents/${row.id}`} className="font-mono text-xs text-accent hover:underline">
                      {row.id}
                    </Link>
                  </td>
                  <td className="max-w-xs px-4 py-2">
                    <p className="truncate text-sm text-text-primary">{row.title}</p>
                  </td>
                  <td className="px-4 py-2"><SeverityBadge severity={row.severity} /></td>
                  <td className="px-4 py-2 text-xs text-text-muted">{STATUS_LABELS[row.status] ?? row.status}</td>
                  <td className="px-4 py-2 font-mono text-xs text-text-muted">{row.assignedTo ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-critical">{formatDate(row.slaDeadline)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-text-muted">{formatDate(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
