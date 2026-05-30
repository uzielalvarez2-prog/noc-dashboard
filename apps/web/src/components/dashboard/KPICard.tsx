"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Trend = "up" | "down" | "neutral";
type Status = "critical" | "warning" | "success" | "info" | "neutral";

interface KPICardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  trend?: Trend;
  trendValue?: string;
  status?: Status;
  icon?: ReactNode;
  className?: string;
}

const STATUS_COLORS: Record<Status, string> = {
  critical: "text-critical",
  warning: "text-warning",
  success: "text-success",
  info: "text-info",
  neutral: "text-text-primary",
};

const TREND_ICONS: Record<Trend, string> = {
  up: "▲",
  down: "▼",
  neutral: "—",
};

const TREND_COLORS: Record<Trend, string> = {
  up: "text-success",
  down: "text-critical",
  neutral: "text-text-muted",
};

export function KPICard({
  title,
  value,
  subtitle,
  trend,
  trendValue,
  status = "neutral",
  icon,
  className,
}: KPICardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-5 transition-colors duration-150 hover:bg-surface-elevated",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
          {title}
        </p>
        {icon && (
          <span className="text-text-muted">{icon}</span>
        )}
      </div>

      <p
        className={cn(
          "mt-2 text-4xl font-bold tabular-nums",
          STATUS_COLORS[status]
        )}
      >
        {value}
      </p>

      <div className="mt-2 flex items-center gap-2">
        {trend && trendValue && (
          <span
            className={cn("text-xs font-medium", TREND_COLORS[trend])}
          >
            {TREND_ICONS[trend]} {trendValue}
          </span>
        )}
        {subtitle && (
          <span className="text-xs text-text-muted">{subtitle}</span>
        )}
      </div>
    </div>
  );
}
