import { db } from "@/lib/db";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

export async function WorkerStatusCard() {
  const lastSync = await db.incident
    .findFirst({ orderBy: { syncedAt: "desc" }, select: { syncedAt: true } })
    .catch(() => null);

  const totalIncidents = await db.incident.count().catch(() => 0);
  const activeRules = await db.alertRule
    .count({ where: { isActive: true } })
    .catch(() => 0);

  const syncedAgo = lastSync?.syncedAt
    ? Date.now() - new Date(lastSync.syncedAt).getTime()
    : null;

  const workerOnline = syncedAgo !== null && syncedAgo < 60_000;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-4 text-base font-semibold text-text-primary">
        Estado del sistema
      </h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Worker HPSM
          </p>
          <div className="flex items-center gap-1.5">
            {workerOnline ? (
              <CheckCircle className="h-4 w-4 text-success" />
            ) : (
              <XCircle className="h-4 w-4 text-text-muted" />
            )}
            <span
              className={`text-sm font-medium ${
                workerOnline ? "text-success" : "text-text-muted"
              }`}
            >
              {workerOnline ? "Activo" : "Sin sync"}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Último sync
          </p>
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-text-muted" />
            <span className="text-sm text-text-primary">
              {lastSync?.syncedAt
                ? formatRelativeTime(lastSync.syncedAt)
                : "Nunca"}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Incidentes en DB
          </p>
          <span className="text-2xl font-bold tabular-nums text-text-primary">
            {totalIncidents}
          </span>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Reglas activas
          </p>
          <span
            className={`text-2xl font-bold tabular-nums ${
              activeRules > 0 ? "text-success" : "text-text-muted"
            }`}
          >
            {activeRules}
          </span>
        </div>
      </div>
    </div>
  );
}
