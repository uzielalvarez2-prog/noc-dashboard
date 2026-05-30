"use client";

import { cn } from "@/lib/utils";
import type { Severity } from "@/types";

interface SeverityBadgeProps {
  severity: Severity;
  className?: string;
}

const SEVERITY_CONFIG: Record<Severity, { label: string; className: string }> =
  {
    CRITICAL: { label: "CRÍTICO", className: "badge-critical" },
    HIGH: { label: "ALTO", className: "badge-warning" },
    MEDIUM: { label: "MEDIO", className: "badge-info" },
    LOW: { label: "BAJO", className: "badge-low" },
  };

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const config = SEVERITY_CONFIG[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold tracking-wide",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
