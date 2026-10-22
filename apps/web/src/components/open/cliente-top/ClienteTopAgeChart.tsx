"use client";

import { cn } from "@/lib/utils";
import { SLA_MS, formatEdad, type ClienteTopIncidente } from "./clienteTopUtils";

// Antigüedad de cada IM del cliente: una barra por incidente y una marca en el SLA
// de 4h. La escala es de raíz cuadrada para que un IM de 8 días no aplaste a los
// de pocas horas (con escala lineal la marca del SLA quedaría pegada al borde).
export function ClienteTopAgeChart({
  incidentes,
  now,
}: {
  incidentes: ClienteTopIncidente[];
  now: number;
}) {
  const rows = incidentes
    .map((i) => ({ ...i, ageMs: Math.max(0, now - Date.parse(i.openTime)) }))
    .sort((a, b) => b.ageMs - a.ageMs);
  if (rows.length === 0) return null;

  const scaleMax = Math.max(rows[0].ageMs, SLA_MS * 1.5);
  const pos = (ms: number) => Math.sqrt(Math.min(ms, scaleMax) / scaleMax) * 100;
  const slaPos = pos(SLA_MS);

  return (
    <div className="rounded-2xl border border-border/60 bg-surface/60 p-4 backdrop-blur-md">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-text-muted">
        Antigüedad de sus IM&apos;s
      </p>
      <div className="grid grid-cols-[8.5rem_1fr_4.5rem] items-end gap-x-3 md:grid-cols-[8.5rem_1fr_4.5rem_8rem]">
        <span />
        <div className="relative h-4">
          <span
            className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-text-muted"
            style={{ left: `${slaPos}%` }}
          >
            SLA 4h
          </span>
        </div>
        <span />
        <span className="hidden md:block" />
      </div>
      <ul className="max-h-64 space-y-1.5 overflow-y-auto pt-1">
        {rows.map((r) => {
          const late = !r.resolved && r.ageMs > SLA_MS;
          const tone = r.resolved ? "success" : late ? "critical" : "warning";
          return (
            <li
              key={r.incidentId}
              className="grid grid-cols-[8.5rem_1fr_4.5rem] items-center gap-x-3 md:grid-cols-[8.5rem_1fr_4.5rem_8rem]"
              title={[r.incidentId, r.siteName || r.serviceId, r.status, r.assignee]
                .filter(Boolean)
                .join(" · ")}
            >
              <span className="truncate font-mono text-xs text-text-primary">{r.incidentId}</span>
              <div className="relative h-2 rounded-full bg-surface-elevated">
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full",
                    tone === "success" && "bg-success/70",
                    tone === "critical" && "bg-critical",
                    tone === "warning" && "bg-warning",
                  )}
                  style={{ width: `${Math.max(2, pos(r.ageMs))}%` }}
                />
                <span
                  className="absolute -bottom-0.5 -top-0.5 w-px bg-text-muted/60"
                  style={{ left: `${slaPos}%` }}
                />
              </div>
              <span
                className={cn(
                  "text-right text-xs font-medium tabular-nums",
                  tone === "success" && "text-success",
                  tone === "critical" && "text-critical",
                  tone === "warning" && "text-warning",
                )}
              >
                {formatEdad(r.ageMs)}
              </span>
              <span className="hidden truncate text-[11px] text-text-muted md:block">{r.status}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
