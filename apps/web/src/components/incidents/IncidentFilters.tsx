"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IncidentFilters } from "@/hooks/useIncidentFilters";

interface IncidentFiltersBarProps {
  filters: IncidentFilters;
  onFilter: (updates: Partial<IncidentFilters>) => void;
}

export function IncidentFiltersBar({ filters, onFilter }: IncidentFiltersBarProps) {
  const hasActive =
    !!filters.severity || !!filters.status || !!filters.assignedTo || filters.slaRisk;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Severidad */}
      <Select
        value={filters.severity || "all"}
        onValueChange={(v) => onFilter({ severity: v === "all" ? "" : (v as IncidentFilters["severity"]) })}
      >
        <SelectTrigger className="h-8 w-36 border-border bg-surface text-xs text-text-primary">
          <SelectValue placeholder="Severidad" />
        </SelectTrigger>
        <SelectContent className="border-border bg-surface text-text-primary">
          <SelectItem value="all">Todas</SelectItem>
          <SelectItem value="CRITICAL">CRÍTICO</SelectItem>
          <SelectItem value="HIGH">ALTO</SelectItem>
          <SelectItem value="MEDIUM">MEDIO</SelectItem>
          <SelectItem value="LOW">BAJO</SelectItem>
        </SelectContent>
      </Select>

      {/* Estado */}
      <Select
        value={filters.status || "all"}
        onValueChange={(v) => onFilter({ status: v === "all" ? "" : (v as IncidentFilters["status"]) })}
      >
        <SelectTrigger className="h-8 w-40 border-border bg-surface text-xs text-text-primary">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent className="border-border bg-surface text-text-primary">
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="OPEN">Abierto</SelectItem>
          <SelectItem value="IN_PROGRESS">En progreso</SelectItem>
          <SelectItem value="RESOLVED">Resuelto</SelectItem>
          <SelectItem value="CLOSED">Cerrado</SelectItem>
        </SelectContent>
      </Select>

      {/* SLA en riesgo toggle */}
      <button
        onClick={() => onFilter({ slaRisk: !filters.slaRisk })}
        className={`flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
          filters.slaRisk
            ? "border-warning bg-warning-dim text-warning"
            : "border-border bg-surface text-text-muted hover:text-text-primary"
        }`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        SLA en riesgo
      </button>

      {/* Limpiar filtros */}
      {hasActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onFilter({ severity: "", status: "", assignedTo: "", slaRisk: false })
          }
          className="h-8 px-2 text-xs text-text-muted hover:text-text-primary"
        >
          Limpiar filtros ×
        </Button>
      )}
    </div>
  );
}
