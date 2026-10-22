"use client";

import {
  RED_MS,
  SLA_MS,
  ageColor,
  formatEdad,
  type ClienteTopIncidente,
} from "./clienteTopUtils";

// Antigüedad de cada IM del cliente: una barra por incidente y una marca en el SLA
// de 4h. La escala es de raíz cuadrada para que un IM de 8 días no aplaste a los
// de pocas horas (con escala lineal la marca del SLA quedaría pegada al borde).
// El color es progresivo: verde tenue dentro del SLA; al pasarlo arranca en ámbar
// y se va tornando a rojo (pleno a las 24h). Es un degradado de TODA la pista, así
// cada barra deja ver hasta qué tramo llegó.
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
  const redPos = pos(RED_MS);
  const trackGradient = `linear-gradient(to right, ${ageColor(0, 0.5)} 0%, ${ageColor(SLA_MS, 0.5)} ${slaPos}%, ${ageColor(SLA_MS + 1, 0.75)} ${slaPos}%, ${ageColor(RED_MS, 0.65)} ${redPos}%, ${ageColor(RED_MS, 0.65)} 100%)`;

  return (
    <div className="@container rounded-2xl border border-border/60 bg-surface/60 p-4 backdrop-blur-md">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-text-muted">
        Antigüedad de sus IM&apos;s
      </p>
      <div className="grid grid-cols-[8.5rem_1fr_4.5rem] items-end gap-x-3 @lg:grid-cols-[8.5rem_1fr_4.5rem_8rem]">
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
        <span className="hidden @lg:block" />
      </div>
      <ul className="max-h-64 space-y-1.5 overflow-y-auto pt-1">
        {rows.map((r) => {
          // Un IM resuelto (por cerrar) ya no corre contra el SLA: va todo en verde.
          const ageMs = r.resolved ? 0 : r.ageMs;
          const width = Math.max(2, pos(r.ageMs));
          return (
            <li
              key={r.incidentId}
              className="grid grid-cols-[8.5rem_1fr_4.5rem] items-center gap-x-3 @lg:grid-cols-[8.5rem_1fr_4.5rem_8rem]"
              title={[r.incidentId, r.siteName || r.serviceId, r.status, r.assignee]
                .filter(Boolean)
                .join(" · ")}
            >
              <span className="truncate font-mono text-xs text-text-primary">{r.incidentId}</span>
              <div className="relative h-2 rounded-full bg-surface-elevated">
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={
                    r.resolved
                      ? { width: `${width}%`, background: ageColor(0, 0.5) }
                      : {
                          width: `${width}%`,
                          backgroundImage: trackGradient,
                          // El degradado abarca toda la pista, no solo lo que mide la barra.
                          backgroundSize: `${10000 / width}% 100%`,
                          backgroundRepeat: "no-repeat",
                        }
                  }
                />
                <span
                  className="absolute -bottom-0.5 -top-0.5 w-px bg-text-muted/60"
                  style={{ left: `${slaPos}%` }}
                />
              </div>
              <span
                className="text-right text-xs font-medium tabular-nums"
                style={{ color: ageColor(ageMs, 0.95) }}
              >
                {formatEdad(r.ageMs)}
              </span>
              <span className="hidden truncate text-[11px] text-text-muted @lg:block">{r.status}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
