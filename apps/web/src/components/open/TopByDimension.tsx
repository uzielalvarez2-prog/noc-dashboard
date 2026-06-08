"use client";

import { useState } from "react";
import { Download, Copy, Check } from "lucide-react";
import type { TopRow } from "@/types/open";
import {
  topToCSV,
  downloadCSV,
  topToHTMLTable,
  copyHTMLTable,
  topToPlain,
} from "@/lib/openExport";
import { cn } from "@/lib/utils";

type Metric = "sites" | "incidents";

export function TopByDimension({
  title,
  dimensionLabel,
  rows,
  fileBase,
  limit = 12,
}: {
  title: string;
  dimensionLabel: string;
  rows: TopRow[];
  fileBase: string;
  limit?: number;
}) {
  const [metric, setMetric] = useState<Metric>("sites");
  const [copied, setCopied] = useState(false);

  const sorted = [...rows].sort((a, b) =>
    metric === "sites" ? b.sites - a.sites : b.incidents - a.incidents
  );
  const top = sorted.slice(0, limit);
  const totalSites = rows.reduce((s, r) => s + r.sites, 0);
  const totalInc = rows.reduce((s, r) => s + r.incidents, 0);
  const max = Math.max(1, ...top.map((r) => (metric === "sites" ? r.sites : r.incidents)));

  async function onCopy() {
    const html = topToHTMLTable(
      top,
      `${title} — ${metric === "sites" ? "sitios afectados" : "incidentes"}`,
      dimensionLabel,
      metric
    );
    if (await copyHTMLTable(html, topToPlain(top, metric))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  function onExport() {
    downloadCSV(`${fileBase}.csv`, topToCSV(sorted, dimensionLabel));
  }

  const chip = (active: boolean) =>
    cn(
      "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
      active ? "bg-accent/15 text-accent" : "text-text-muted hover:text-text-primary"
    );

  return (
    <div className="rounded-xl border border-border/60 bg-surface/60 p-4 backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMetric("sites")} className={chip(metric === "sites")}>
            Sitios
          </button>
          <button type="button" onClick={() => setMetric("incidents")} className={chip(metric === "incidents")}>
            Incidentes
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        {top.length === 0 && (
          <p className="py-6 text-center text-xs text-text-muted">Sin datos — sube un CSV de abiertos</p>
        )}
        {top.map((r) => {
          const v = metric === "sites" ? r.sites : r.incidents;
          return (
            <div key={r.name} className="flex items-center gap-2">
              <span className="w-40 shrink-0 truncate text-xs text-text-primary" title={r.name}>
                {r.name}
              </span>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-surface-elevated/60">
                <div
                  className="absolute inset-y-0 left-0 rounded bg-accent/30"
                  style={{ width: `${(v / max) * 100}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right font-mono text-xs text-text-primary">{v}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
        <span className="text-xs text-text-muted">
          {totalSites} sitios · {totalInc} incidentes
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-primary"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copiado" : "Copiar tabla"}
          </button>
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-primary"
          >
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
        </div>
      </div>
    </div>
  );
}
