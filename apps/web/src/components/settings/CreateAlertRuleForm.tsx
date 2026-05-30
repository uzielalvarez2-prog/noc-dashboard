"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TRIGGERS = [
  { value: "CRITICAL_OPEN",       label: "Incidente CRÍTICO abierto" },
  { value: "CRITICAL_UNASSIGNED", label: "Incidente CRÍTICO sin asignar" },
  { value: "SLA_RISK",            label: "SLA en riesgo (< 2h restantes)" },
  { value: "SLA_BREACHED",        label: "SLA vencido" },
];

interface CreateAlertRuleFormProps {
  onCreated: () => void;
}

export function CreateAlertRuleForm({ onCreated }: CreateAlertRuleFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);

  function addEmail() {
    const e = emailInput.trim().toLowerCase();
    if (!e || !e.includes("@") || recipients.includes(e)) return;
    setRecipients((prev) => [...prev, e]);
    setEmailInput("");
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!name || !trigger || recipients.length === 0) {
      setError("Completa todos los campos y agrega al menos un destinatario.");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, trigger, channels: ["email"], recipients }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Error al crear la regla. Intenta de nuevo.");
      return;
    }
    setName(""); setTrigger(""); setRecipients([]); setEmailInput("");
    setOpen(false);
    onCreated();
  }

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        size="sm"
        className="gap-1.5 border-border bg-surface text-text-muted hover:text-text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
        Nueva regla
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-accent/30 bg-surface p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">
        Crear regla de alerta
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Nombre
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Alertas críticas NOC"
              className="border-border bg-surface-elevated text-text-primary"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Disparador
            </label>
            <Select value={trigger} onValueChange={(v) => setTrigger(v ?? "")}>
              <SelectTrigger className="border-border bg-surface-elevated text-text-primary">
                <SelectValue placeholder="Selecciona un evento" />
              </SelectTrigger>
              <SelectContent className="border-border bg-surface text-text-primary">
                {TRIGGERS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Destinatarios */}
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Destinatarios email
          </label>
          <div className="flex gap-2">
            <Input
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
              placeholder="email@empresa.com"
              type="email"
              className="border-border bg-surface-elevated text-text-primary"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addEmail}
              className="shrink-0 border-border"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {recipients.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {recipients.map((r) => (
                <span
                  key={r}
                  className="flex items-center gap-1 rounded border border-border bg-surface-elevated px-2 py-0.5 font-mono text-xs text-text-muted"
                >
                  {r}
                  <button
                    type="button"
                    onClick={() => setRecipients((p) => p.filter((e) => e !== r))}
                    className="hover:text-critical"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="rounded border border-critical bg-critical-dim px-3 py-2 text-xs text-critical">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={loading}
            size="sm"
            className="bg-accent text-white hover:bg-accent/90"
          >
            {loading ? "Guardando..." : "Crear regla"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            className="text-text-muted"
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
