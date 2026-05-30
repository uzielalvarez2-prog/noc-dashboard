"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { loginAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
    >
      {pending ? "Iniciando sesión..." : "Iniciar sesión"}
    </Button>
  );
}

export default function LoginPage() {
  const [state, action] = useActionState(loginAction, null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-text-primary">NOC Dashboard</h1>
          <p className="mt-1 text-sm text-text-muted">
            Centro de Operaciones de Red
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <form action={action} className="space-y-4">
            <div className="space-y-1">
              <label
                htmlFor="email"
                className="text-xs font-medium uppercase tracking-wider text-text-muted"
              >
                Email
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="operador@empresa.com"
                required
                defaultValue="admin@noc.local"
                className="border-border bg-surface-elevated text-text-primary placeholder:text-text-disabled focus:border-accent"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="password"
                className="text-xs font-medium uppercase tracking-wider text-text-muted"
              >
                Contraseña
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                className="border-border bg-surface-elevated text-text-primary placeholder:text-text-disabled focus:border-accent"
              />
            </div>

            {state?.error && (
              <p className="rounded border border-critical bg-critical-dim px-3 py-2 text-xs text-critical">
                {state.error}
              </p>
            )}

            <SubmitButton />
          </form>
        </div>

        <p className="mt-4 text-center font-mono text-xs text-text-disabled">
          NOC v1.0 — Uso exclusivo interno
        </p>
      </div>
    </div>
  );
}
