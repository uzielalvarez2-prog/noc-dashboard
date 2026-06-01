"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuditEntry {
  id: string;
  action: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { name: string; email: string };
}

interface AuditResponse {
  logs: AuditEntry[];
  total: number;
  page: number;
  pages: number;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE_USER:  "Crear usuario",
  UPDATE_USER:  "Editar usuario",
  DELETE_USER:  "Eliminar usuario",
  IMPORT_CSV:   "Importar CSV",
  CREATE_ALERT: "Crear regla de alerta",
  UPDATE_ALERT: "Editar regla de alerta",
  DELETE_ALERT: "Eliminar regla de alerta",
};

const ACTION_COLORS: Record<string, string> = {
  CREATE_USER:  "text-success",
  UPDATE_USER:  "text-accent",
  DELETE_USER:  "text-critical",
  IMPORT_CSV:   "text-info",
  CREATE_ALERT: "text-success",
  UPDATE_ALERT: "text-warning",
  DELETE_ALERT: "text-critical",
};

function metaSummary(action: string, meta: Record<string, unknown> | null): string {
  if (!meta) return "";
  if (action === "IMPORT_CSV") return `${meta.upserted ?? 0} importados, ${meta.errors ?? 0} errores`;
  if (action === "CREATE_USER") return `${meta.email ?? ""} (${meta.role ?? ""})`;
  if (action === "UPDATE_USER") return `Campos: ${(meta.fields as string[] | undefined)?.join(", ") ?? ""}`;
  if (action === "DELETE_USER") return `${meta.email ?? ""}`;
  return "";
}

async function fetchLogs(page: number): Promise<AuditResponse> {
  const res = await fetch(`/api/audit-logs?page=${page}`);
  if (!res.ok) throw new Error("Error al cargar audit log");
  return res.json();
}

export function AuditLogPanel() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page],
    queryFn: () => fetchLogs(page),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-text-muted" />
        <h2 className="text-base font-semibold text-text-primary">Audit log</h2>
        {data && (
          <span className="ml-auto text-xs text-text-muted">{data.total} entradas</span>
        )}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">Fecha</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">Usuario</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">Acción</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-muted">
                  Cargando...
                </td>
              </tr>
            )}
            {!isLoading && data?.logs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-muted">
                  Sin registros de auditoría
                </td>
              </tr>
            )}
            {data?.logs.map((entry) => (
              <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-surface-elevated/40 transition-colors">
                <td className="px-4 py-2.5 font-mono text-xs text-text-muted whitespace-nowrap">
                  {new Date(entry.createdAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                </td>
                <td className="px-4 py-2.5 text-xs text-text-primary">{entry.user.name}</td>
                <td className="px-4 py-2.5 text-xs">
                  <span className={`font-medium ${ACTION_COLORS[entry.action] ?? "text-text-muted"}`}>
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-text-muted">
                  {metaSummary(entry.action, entry.metadata)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="h-7 w-7 p-0 border-border text-text-muted hover:bg-surface-elevated">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-text-muted">
            Página {data.page} de {data.pages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}
            className="h-7 w-7 p-0 border-border text-text-muted hover:bg-surface-elevated">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
