"use client";

import { useState } from "react";
import { Trash2, Mail, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const TRIGGER_LABELS: Record<string, { label: string; color: string }> = {
  CRITICAL_OPEN:       { label: "Crítico abierto",       color: "text-critical" },
  CRITICAL_UNASSIGNED: { label: "Crítico sin asignar",   color: "text-critical" },
  SLA_RISK:            { label: "SLA en riesgo",          color: "text-warning"  },
  SLA_BREACHED:        { label: "SLA vencido",            color: "text-warning"  },
};

interface AlertRule {
  id: string;
  name: string;
  trigger: string;
  channels: string[];
  recipients: string[];
  isActive: boolean;
  createdAt: string;
}

interface AlertRuleCardProps {
  rule: AlertRule;
  onToggle: (id: string, active: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function AlertRuleCard({ rule, onToggle, onDelete }: AlertRuleCardProps) {
  const [loading, setLoading] = useState(false);
  const { label, color } = TRIGGER_LABELS[rule.trigger] ?? {
    label: rule.trigger,
    color: "text-text-muted",
  };

  async function handleToggle() {
    setLoading(true);
    await onToggle(rule.id, !rule.isActive);
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar la regla "${rule.name}"?`)) return;
    setLoading(true);
    await onDelete(rule.id);
    setLoading(false);
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        rule.isActive ? "border-border bg-surface" : "border-border/50 bg-surface opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className={cn("h-3.5 w-3.5 shrink-0", color)} />
            <span className="font-medium text-text-primary text-sm">{rule.name}</span>
            <span className={cn("text-xs font-medium", color)}>
              · {label}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {rule.recipients.map((r) => (
              <span
                key={r}
                className="flex items-center gap-1 rounded border border-border bg-surface-elevated px-2 py-0.5 font-mono text-xs text-text-muted"
              >
                <Mail className="h-2.5 w-2.5" />
                {r}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Toggle */}
          <button
            onClick={handleToggle}
            disabled={loading}
            className={cn(
              "relative h-5 w-9 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50",
              rule.isActive ? "bg-success" : "bg-border"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200",
                rule.isActive ? "translate-x-4" : "translate-x-0.5"
              )}
            />
          </button>

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={loading}
            className="rounded p-1 text-text-muted transition-colors hover:bg-critical-dim hover:text-critical disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
