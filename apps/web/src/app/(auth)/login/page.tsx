"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@noc.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Credenciales incorrectas.");
        setLoading(false);
        return;
      }

      // Login exitoso — redirigir con window.location (más confiable que router.push)
      window.location.href = "/";
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
      setLoading(false);
    }
  }

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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operador@empresa.com"
                required
                className="border-border bg-surface-elevated text-text-primary placeholder:text-text-disabled focus:border-accent"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Contraseña
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="border-border bg-surface-elevated text-text-primary placeholder:text-text-disabled focus:border-accent"
              />
            </div>

            {error && (
              <p className="rounded border border-critical bg-critical-dim px-3 py-2 text-xs text-critical">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {loading ? "Redirigiendo al dashboard..." : "Iniciar sesión"}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center font-mono text-xs text-text-disabled">
          NOC v1.0 — Uso exclusivo interno
        </p>
      </div>
    </div>
  );
}
