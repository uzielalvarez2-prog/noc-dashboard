"use client";

import { useState } from "react";
import { Loader2, Pencil, Check, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { OpenIncidentTable } from "../OpenIncidentTable";
import { ClienteTopAgeChart } from "./ClienteTopAgeChart";
import { SEV, severityOf, formatEdad, SLA_MS, type ClienteTopStat } from "./clienteTopUtils";

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface/60 px-3 py-2 backdrop-blur-md">
      <span className={cn("block text-xl font-bold tabular-nums leading-tight", tone ?? "text-text-primary")}>
        {value}
      </span>
      <span className="text-[11px] font-medium text-text-muted">{label}</span>
    </div>
  );
}

// Ficha del cliente (panel derecho): KPIs, gráfica de antigüedad, desglose por
// estado y la tabla de incidentes de siempre (OpenIncidentTable con companyFilter,
// que es la que trae la columna F.TXT).
export function ClienteTopDetail({
  cliente,
  now,
  onBack,
  onRemove,
  removing,
  onRename,
  renaming,
}: {
  cliente: ClienteTopStat;
  now: number;
  onBack: () => void;
  onRemove: () => void;
  removing: boolean;
  onRename: (alias: string) => void;
  renaming: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [alias, setAlias] = useState(cliente.note ?? "");

  function saveAlias() {
    onRename(alias.trim());
    setEditing(false);
  }

  const sev = SEV[severityOf(cliente)];
  const activos = cliente.incidentes.filter((i) => !i.resolved);
  const masAntiguo = activos.reduce((max, i) => Math.max(max, now - Date.parse(i.openTime)), 0);

  // IM's por estado; un IM que toca varios estados cuenta en cada uno.
  const porEstado = new Map<string, number>();
  for (const i of cliente.incidentes) {
    for (const s of i.states) porEstado.set(s, (porEstado.get(s) ?? 0) + 1);
  }
  const estados = [...porEstado.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  const MAX_ESTADOS = 8;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-medium text-accent hover:underline lg:hidden"
        >
          ← Ver todos los clientes
        </button>
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveAlias();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder={cliente.company}
              maxLength={60}
              className="h-8 rounded-md border border-border bg-background/60 px-2 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={saveAlias}
              disabled={renaming}
              title="Guardar"
              className="rounded p-1 text-success hover:bg-success-dim disabled:opacity-50"
            >
              {renaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              title="Cancelar"
              className="rounded p-1 text-text-muted hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", sev.dot)} />
            <h2
              className="min-w-0 truncate text-lg font-semibold text-text-primary"
              title={cliente.company}
            >
              {cliente.displayName}
            </h2>
            <button
              type="button"
              onClick={() => {
                setAlias(cliente.note ?? "");
                setEditing(true);
              }}
              title="Editar nombre abreviado"
              className="rounded p-1 text-text-muted hover:text-text-primary"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-critical/40 px-2 py-0.5 text-xs text-critical hover:bg-critical-dim disabled:opacity-50"
        >
          {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Quitar de Cliente TOP
        </button>
      </div>
      {cliente.displayName !== cliente.company && (
        <p className="-mt-2 truncate text-xs text-text-muted">{cliente.company}</p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="En gestión" value={cliente.activeCount} tone={cliente.activeCount > 0 ? "text-warning" : undefined} />
        <Kpi
          label="Con dilación (>4h)"
          value={cliente.criticalCount}
          tone={cliente.criticalCount > 0 ? "text-critical" : undefined}
        />
        <Kpi
          label="Más antiguo"
          value={activos.length > 0 ? formatEdad(masAntiguo) : "—"}
          tone={masAntiguo > SLA_MS ? "text-critical" : undefined}
        />
        <Kpi
          label="Resueltos (por cerrar)"
          value={cliente.openCount - cliente.activeCount}
          tone={cliente.openCount - cliente.activeCount > 0 ? "text-success" : undefined}
        />
      </div>

      <ClienteTopAgeChart incidentes={cliente.incidentes} now={now} />

      {estados.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">Por estado</span>
          {estados.slice(0, MAX_ESTADOS).map(([estado, n]) => (
            <span
              key={estado}
              className="rounded-full border border-border/60 bg-surface/60 px-2.5 py-0.5 text-xs text-text-primary"
            >
              {estado} <span className="font-semibold tabular-nums text-accent">{n}</span>
            </span>
          ))}
          {estados.length > MAX_ESTADOS && (
            <span className="text-xs text-text-muted">+{estados.length - MAX_ESTADOS} más</span>
          )}
        </div>
      )}

      <OpenIncidentTable group="ALL" sortDir="desc" companyFilter={cliente.company} />
    </div>
  );
}
