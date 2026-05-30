"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { SeverityBadge } from "./SeverityBadge";
import { IncidentFiltersBar } from "./IncidentFilters";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatSlaRemaining } from "@/lib/utils";
import { useIncidentFilters } from "@/hooks/useIncidentFilters";
import { exportIncidentsCSV } from "./exportCsv";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { Incident, Severity } from "@/types";

interface PaginatedResponse {
  data: Incident[];
  meta: { total: number; page: number; limit: number; lastSync: string };
}

async function fetchIncidents(qs: string): Promise<PaginatedResponse> {
  const res = await fetch(`/api/incidents?${qs}`);
  if (!res.ok) throw new Error("Error al obtener incidentes");
  return res.json();
}

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

export function IncidentTable() {
  const router = useRouter();
  const { filters, setFilters, buildQueryString } = useIncidentFilters();
  const qs = buildQueryString();

  const { data, isLoading, isFetching } = useQuery<PaginatedResponse>({
    queryKey: ["incidents", qs],
    queryFn: () => fetchIncidents(qs),
    refetchInterval: 10_000,
    placeholderData: (prev) => prev,
  });

  const incidents = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = Math.ceil(total / filters.limit);
  const lastSync = data?.meta.lastSync;

  const columns: ColumnDef<Incident>[] = [
    {
      accessorKey: "id",
      header: "ID",
      size: 130,
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-text-muted">
          {getValue<string>()}
        </span>
      ),
    },
    {
      accessorKey: "title",
      header: "Título",
      cell: ({ getValue, row }) => (
        <div className="flex flex-col">
          <span className="truncate text-sm text-text-primary">
            {getValue<string>()}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "severity",
      header: "Severidad",
      size: 100,
      cell: ({ getValue }) => (
        <SeverityBadge severity={getValue<Severity>()} />
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      size: 120,
      cell: ({ getValue }) => {
        const s = getValue<string>();
        return (
          <span className={cn("text-xs font-medium", STATUS_COLORS[s])}>
            {STATUS_LABELS[s] ?? s}
          </span>
        );
      },
    },
    {
      accessorKey: "assignedTo",
      header: "Asignado",
      size: 110,
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-text-muted">
          {getValue<string | null>() ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "slaDeadline",
      header: "Deadline SLA",
      size: 130,
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-text-muted">
          {formatDate(getValue<string>())}
        </span>
      ),
    },
    {
      id: "slaRemaining",
      header: "SLA Restante",
      size: 110,
      cell: ({ row }) => {
        const { slaDeadline, slaBreached } = row.original;
        if (slaBreached) {
          return (
            <span className="font-mono text-xs font-semibold text-critical">
              VENCIDO
            </span>
          );
        }
        const { label, color } = formatSlaRemaining(slaDeadline);
        return (
          <span
            className={cn(
              "font-mono text-xs font-medium",
              color === "critical"
                ? "text-critical"
                : color === "warning"
                ? "text-warning"
                : "text-text-muted"
            )}
          >
            {label}
          </span>
        );
      },
    },
  ];

  const table = useReactTable({
    data: incidents,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <IncidentFiltersBar filters={filters} onFilter={setFilters} />

        <div className="flex items-center gap-2">
          {lastSync && (
            <span className="font-mono text-xs text-text-muted">
              Sync: {new Date(lastSync).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportIncidentsCSV(incidents)}
            className="h-8 gap-1.5 border-border bg-surface text-xs text-text-muted hover:text-text-primary"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-border bg-surface-elevated">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-muted"
                      style={{ width: header.getSize() }}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length} className="py-12 text-center text-sm text-text-muted">
                    Cargando...
                  </td>
                </tr>
              ) : incidents.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-12 text-center text-sm text-text-muted">
                    Sin incidentes con los filtros actuales
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const isCritical = row.original.severity === "CRITICAL";
                  const isBreached = row.original.slaBreached;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => router.push(`/incidents/${row.original.id}`)}
                      className={cn(
                        "cursor-pointer border-b border-border transition-colors duration-100",
                        isBreached
                          ? "bg-critical-dim hover:bg-critical-dim/80"
                          : isCritical
                          ? "hover:bg-critical-dim/40"
                          : "hover:bg-surface-elevated"
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="h-9 px-3 py-0">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>
          {total > 0
            ? `${(filters.page - 1) * filters.limit + 1}–${Math.min(filters.page * filters.limit, total)} de ${total} incidentes`
            : "0 incidentes"}
          {isFetching && !isLoading && (
            <span className="ml-2 text-accent">actualizando...</span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={filters.page <= 1}
            onClick={() => setFilters({ page: filters.page - 1 })}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2">
            {filters.page} / {Math.max(1, totalPages)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={filters.page >= totalPages}
            onClick={() => setFilters({ page: filters.page + 1 })}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
