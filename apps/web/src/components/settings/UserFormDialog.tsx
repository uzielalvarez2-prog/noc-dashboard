"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface UserFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user?: User | null;
}

const ROLES = [
  { value: "IDS",        label: "IDS — Ingeniero de Diagnóstico y Solución" },
  { value: "SUPERVISOR", label: "Supervisor" },
  { value: "ADMIN",      label: "Administrador" },
];

export function UserFormDialog({ open, onClose, onSuccess, user }: UserFormDialogProps) {
  const isEdit = !!user;

  const [name,     setName]     = useState(user?.name  ?? "");
  const [email,    setEmail]    = useState(user?.email ?? "");
  const [role,     setRole]     = useState(user?.role  ?? "IDS");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // Sync fields when editing a different user
  useEffect(() => {
    setName(user?.name  ?? "");
    setEmail(user?.email ?? "");
    setRole(user?.role  ?? "IDS");
    setPassword("");
    setError(null);
  }, [user, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isEdit && !password.trim()) { setError("La contraseña es requerida"); return; }
    if (password && password.length < 6) { setError("Mínimo 6 caracteres"); return; }
    setLoading(true);
    try {
      const url    = isEdit ? `/api/users/${user!.id}` : "/api/users";
      const method = isEdit ? "PATCH" : "POST";
      const body: Record<string, string> = { name, role };
      if (!isEdit) { body.email = email; body.password = password; }
      else if (password.trim()) body.password = password;

      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "Error desconocido"); return; }
      onSuccess();
      onClose();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold text-text-primary">
          {isEdit ? "Editar usuario" : "Crear usuario"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Nombre</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Juan Pérez"
              required
              className="border-border bg-surface-elevated text-text-primary placeholder:text-text-disabled"
            />
          </div>

          {!isEdit && (
            <div className="space-y-1">
              <label className="text-xs text-text-muted">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="juan@empresa.com"
                required
                className="border-border bg-surface-elevated text-text-primary placeholder:text-text-disabled"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-text-muted">Rol</label>
            <Select value={role} onValueChange={(v) => setRole(v ?? "IDS")}>
              <SelectTrigger className="border-border bg-surface-elevated text-text-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-border bg-surface-elevated">
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value} className="text-text-primary">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-text-muted">
              {isEdit ? "Nueva contraseña (vacío = sin cambiar)" : "Contraseña"}
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? "••••••••" : "Mínimo 6 caracteres"}
              required={!isEdit}
              className="border-border bg-surface-elevated text-text-primary placeholder:text-text-disabled"
            />
          </div>

          {error && (
            <p className="rounded border border-critical/40 bg-critical-dim px-3 py-2 text-xs text-critical">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}
              className="border-border text-text-muted hover:bg-surface-elevated">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}
              className="bg-accent text-white hover:bg-accent/90">
              {loading ? "Guardando..." : isEdit ? "Guardar" : "Crear"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
