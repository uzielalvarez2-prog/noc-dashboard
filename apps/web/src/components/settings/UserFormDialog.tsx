"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  { value: "NOC_OPERATOR", label: "Operador NOC" },
  { value: "NOC_ADMIN",    label: "Administrador NOC" },
  { value: "ENGINEER",     label: "Ingeniero" },
];

export function UserFormDialog({ open, onClose, onSuccess, user }: UserFormDialogProps) {
  const isEdit = !!user;

  const [name,     setName]     = useState(user?.name     ?? "");
  const [email,    setEmail]    = useState(user?.email    ?? "");
  const [role,     setRole]     = useState(user?.role     ?? "NOC_OPERATOR");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isEdit && !password.trim()) { setError("La contraseña es requerida"); return; }
    if (password && password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres"); return; }

    setLoading(true);
    try {
      const url  = isEdit ? `/api/users/${user!.id}` : "/api/users";
      const method = isEdit ? "PATCH" : "POST";
      const body: Record<string, string> = { name, role };
      if (!isEdit) { body.email = email; body.password = password; }
      else if (password.trim()) body.password = password;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error desconocido"); return; }
      onSuccess();
      onClose();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-surface border-border text-text-primary sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-text-primary">
            {isEdit ? "Editar usuario" : "Crear usuario"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1">
            <label className="text-xs text-text-muted">Nombre</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Juan Pérez"
              required
              className="bg-surface-elevated border-border text-text-primary placeholder:text-text-disabled focus:border-accent"
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
                className="bg-surface-elevated border-border text-text-primary placeholder:text-text-disabled focus:border-accent"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-text-muted">Rol</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="bg-surface-elevated border-border text-text-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-surface-elevated border-border">
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value} className="text-text-primary hover:bg-surface">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-text-muted">
              {isEdit ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña"}
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? "••••••••" : "Mínimo 6 caracteres"}
              required={!isEdit}
              className="bg-surface-elevated border-border text-text-primary placeholder:text-text-disabled focus:border-accent"
            />
          </div>

          {error && (
            <p className="rounded-md border border-critical/40 bg-critical-dim px-3 py-2 text-xs text-critical">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}
              className="border-border text-text-muted hover:bg-surface-elevated">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}
              className="bg-accent text-white hover:bg-accent/90">
              {loading ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear usuario"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
