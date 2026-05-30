"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertRuleCard } from "./AlertRuleCard";
import { CreateAlertRuleForm } from "./CreateAlertRuleForm";
import { Bell } from "lucide-react";

interface AlertRule {
  id: string;
  name: string;
  trigger: string;
  channels: string[];
  recipients: string[];
  isActive: boolean;
  createdAt: string;
}

async function fetchRules(): Promise<AlertRule[]> {
  const res = await fetch("/api/alerts");
  if (!res.ok) throw new Error("Error al cargar reglas");
  return res.json();
}

export function AlertRulesPanel() {
  const qc = useQueryClient();
  const { data: rules = [], isLoading } = useQuery<AlertRule[]>({
    queryKey: ["alertRules"],
    queryFn: fetchRules,
  });

  async function handleToggle(id: string, active: boolean) {
    await fetch(`/api/alerts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: active }),
    });
    qc.invalidateQueries({ queryKey: ["alertRules"] });
  }

  async function handleDelete(id: string) {
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["alertRules"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-text-muted" />
          <h2 className="text-base font-semibold text-text-primary">
            Reglas de alerta
          </h2>
          <span className="rounded-full bg-surface-elevated px-2 py-0.5 font-mono text-xs text-text-muted">
            {rules.filter((r) => r.isActive).length}/{rules.length} activas
          </span>
        </div>
        <CreateAlertRuleForm onCreated={() => qc.invalidateQueries({ queryKey: ["alertRules"] })} />
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-text-muted">Cargando reglas...</p>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-10 text-center">
          <Bell className="mx-auto mb-2 h-6 w-6 text-text-disabled" />
          <p className="text-sm text-text-muted">Sin reglas de alerta configuradas</p>
          <p className="mt-1 text-xs text-text-disabled">
            Crea una regla para recibir emails cuando ocurran incidentes críticos
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <AlertRuleCard
              key={rule.id}
              rule={rule}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Info sobre el worker */}
      <div className="rounded-lg border border-border bg-surface-elevated p-4 text-xs text-text-muted">
        <p className="font-medium text-text-primary mb-1">¿Cómo funcionan las alertas?</p>
        <p>El worker (Railway) evalúa estas reglas cada 10 segundos contra los incidentes en Postgres.
        Cuando se cumple una condición, envía un email vía Resend y marca el incidente en Redis
        para no repetir el envío durante 1 hora.</p>
        <p className="mt-2">
          Para activar: configura <code className="text-accent">RESEND_API_KEY</code> en{" "}
          <code className="text-accent">apps/worker/.env</code>
        </p>
      </div>
    </div>
  );
}
