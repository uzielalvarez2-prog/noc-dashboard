import { formatDate } from "@/lib/utils";

interface BreachRow {
  incidentId: string;
  group: string;
  closedBy: string;
  resCause: string;
  resolutionMins: number;
  openTime: Date | string;
  closeTime: Date | string;
}

function GroupBadge({ group }: { group: string }) {
  const isP = group === "PEXA";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        isP ? "bg-accent/15 text-accent" : "bg-warning/15 text-warning"
      }`}
    >
      {group}
    </span>
  );
}

function ResTime({ mins }: { mins: number }) {
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const label = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return (
    <span className="font-mono text-xs text-critical font-semibold">{label}</span>
  );
}

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
                {["ID", "Grupo", "Asignado", "Causa", "Tiempo", "Abierto", "Cerrado"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {breaches.map((row) => (
                <tr
                  key={row.incidentId}
                  className="border-b border-border bg-critical-dim/30 hover:bg-critical-dim/60 transition-colors"
                >
                  <td className="px-4 py-2 font-mono text-xs text-text-muted">
                    {row.incidentId}
                  </td>
                  <td className="px-4 py-2">
                    <GroupBadge group={row.group} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-text-primary">
                    {row.closedBy || "—"}
                  </td>
                  <td className="max-w-[180px] px-4 py-2">
                    <p className="truncate text-xs text-text-muted" title={row.resCause}>
                      {row.resCause || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-2">
                    <ResTime mins={row.resolutionMins} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-text-muted">
                    {formatDate(row.openTime)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-text-muted">
                    {formatDate(row.closeTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
