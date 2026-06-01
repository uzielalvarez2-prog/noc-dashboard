"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserFormDialog } from "./UserFormDialog";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  NOC_ADMIN:    "Admin",
  NOC_OPERATOR: "Operador",
  ENGINEER:     "Ingeniero",
};

const ROLE_COLORS: Record<string, string> = {
  NOC_ADMIN:    "text-warning border-warning/30 bg-warning/10",
  NOC_OPERATOR: "text-accent border-accent/30 bg-accent/10",
  ENGINEER:     "text-success border-success/30 bg-success/10",
};

async function fetchUsers(): Promise<{ users: User[] }> {
  const res = await fetch("/api/users");
  if (!res.ok) throw new Error("Error al cargar usuarios");
  return res.json();
}

export function UsersPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });

  const [dialogOpen,  setDialogOpen]  = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function openCreate() { setEditingUser(null); setDialogOpen(true); }
  function openEdit(u: User) { setEditingUser(u); setDialogOpen(true); }
  function onSuccess() { qc.invalidateQueries({ queryKey: ["users"] }); qc.invalidateQueries({ queryKey: ["audit-logs"] }); }

  async function handleDelete(id: string) {
    setDeleteError(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setDeleteError(data.error ?? "Error al eliminar"); return; }
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
    } catch {
      setDeleteError("Error de conexión");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-text-muted" />
          <h2 className="text-base font-semibold text-text-primary">Gestión de usuarios</h2>
        </div>
        <Button size="sm" onClick={openCreate}
          className="bg-accent text-white hover:bg-accent/90 h-8 gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" /> Crear usuario
        </Button>
      </div>

      {deleteError && (
        <p className="rounded-md border border-critical/40 bg-critical-dim px-3 py-2 text-xs text-critical">
          {deleteError}
        </p>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-elevated">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">Nombre</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">Email</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">Rol</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">Creado</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-text-muted">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                  Cargando usuarios...
                </td>
              </tr>
            )}
            {!isLoading && data?.users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                  No hay usuarios registrados
                </td>
              </tr>
            )}
            {data?.users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0 hover:bg-surface-elevated/40 transition-colors">
                <td className="px-4 py-3 font-medium text-text-primary">{u.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-text-muted">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role] ?? "text-text-muted"}`}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-text-muted">
                  {new Date(u.createdAt).toLocaleDateString("es-MX")}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(u)}
                      className="h-7 w-7 p-0 text-text-muted hover:text-text-primary hover:bg-surface-elevated">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost"
                      disabled={deletingId === u.id}
                      onClick={() => handleDelete(u.id)}
                      className="h-7 w-7 p-0 text-text-muted hover:text-critical hover:bg-critical-dim">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <UserFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={onSuccess}
        user={editingUser}
      />
    </div>
  );
}
