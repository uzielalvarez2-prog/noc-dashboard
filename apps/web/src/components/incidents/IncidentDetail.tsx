import { SeverityBadge } from "./SeverityBadge";
import { cn, formatDate, formatSlaRemaining } from "@/lib/utils";
import type { Incident, Severity } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En progreso",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "text-critical",
  IN_PROGRESS: "text-warning",
  RESOLVED: "text-success",
  CLOSED: "text-text-muted",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <div className="text-sm text-text-primary">{children}</div>
    </div>
  );
}

export function IncidentDetail({ incident }: { incident: Incident }) {
  const sla = formatSlaRemaining(incident.slaDeadline);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-text-muted">{incident.id}</span>
          <SeverityBadge severity={incident.severity as Severity} />
          {incident.slaBreached && (
            <span className="rounded bg-critical px-2 py-0.5 text-xs font-bold text-white">
              SLA VENCIDO
            </span>
          )}
        </div>
        <h1 className="text-xl font-semibold text-text-primary">{incident.title}</h1>
      </div>

      {/* SLA prominente */}
      <div
        className={cn(
          "rounded-lg border p-4",
          incident.slaBreached
            ? "border-critical bg-critical-dim"
            : sla.color === "warning"
            ? "border-warning bg-warning-dim"
            : "border-border bg-surface"
        )}
      >
        <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
          SLA Restante
        </p>
        <p
          className={cn(
            "mt-1 text-3xl font-bold tabular-nums",
            incident.slaBreached
              ? "text-critical"
              : sla.color === "warning"
              ? "text-warning"
              : "text-success"
          )}
        >
          {incident.slaBreached ? "VENCIDO" : sla.label}
        </p>
        <p className="mt-1 font-mono text-xs text-text-muted">
          Deadline: {formatDate(incident.slaDeadline)}
        </p>
      </div>

      {/* Campos */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Estado">
          <span className={cn("font-medium", STATUS_COLORS[incident.status])}>
            {STATUS_LABELS[incident.status] ?? incident.status}
          </span>
        </Field>

        <Field label="Asignado a">
          <span className="font-mono">{incident.assignedTo ?? "Sin asignar"}</span>
        </Field>

        <Field label="Fuente">
          <span>{incident.source}</span>
        </Field>

        <Field label="Creado">
          <span className="font-mono text-xs">{formatDate(incident.createdAt)}</span>
        </Field>

        <Field label="Actualizado">
          <span className="font-mono text-xs">{formatDate(incident.updatedAt)}</span>
        </Field>

        <Field label="Última sync">
          <span className="font-mono text-xs">{formatDate(incident.syncedAt)}</span>
        </Field>
      </div>

      {/* Raw data colapsable */}
      <details className="rounded-lg border border-border bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-text-muted hover:text-text-primary">
          Raw data (HPSM) ›
        </summary>
        <pre className="overflow-auto p-4 font-mono text-xs text-text-muted">
          {JSON.stringify(incident.rawData, null, 2)}
        </pre>
      </details>
    </div>
  );
}
