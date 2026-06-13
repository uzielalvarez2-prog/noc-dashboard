"use client";

import { useState } from "react";
import { Download, Copy, Check, Loader2 } from "lucide-react";
import type { TopRow, OpenIncidentRow } from "@/types/open";
import { copyHTMLTable } from "@/lib/openExport";
import { downloadXLSX } from "@/lib/excelExport";

// El Excel solo lleva la columna de su propia dimensión: Top por Estado omite
// Distrito y Top por Distrito omite Estado (así la masiva queda limpia).
function detailCols(dimField: "state" | "district"): string[] {
  const dim = dimField === "state" ? "Estado" : "Distrito";
  return ["Incident ID", "Apertura", "Estatus", "Empresa", "Servicio", dim, "Asignado", "Grupo"];
}

function detailToRows(rows: OpenIncidentRow[], dimField: "state" | "district"): (string | number)[][] {
  return rows.map((r) => [
    r.incidentId,
    new Date(r.openTime).toLocaleString("es-MX", { hour12: false }),
    r.status,
    r.company,
    r.serviceId,
    dimField === "state" ? r.state : r.district,
    r.assignee ?? "",
    r.group,
  ]);
}

// Paleta de colores distinta por posición
const PALETTE = [
  "#38bdf8", "#f59e0b", "#a78bfa", "#34d399", "#fb7185",
  "#fb923c", "#22d3ee", "#f472b6", "#a3e635", "#e879f9",
  "#4ade80", "#94a3b8",
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function detailToHTML(rows: OpenIncidentRow[], title: string, dimLabel: string, dimField: "state" | "district"): string {
  const th = (s: string) => `<th style="background:#1e293b;color:#94a3b8;padding:6px 10px;text-align:left;white-space:nowrap">${escapeHtml(s)}</th>`;
  const td = (s: string) => `<td style="padding:5px 10px;border-bottom:1px solid #334155;white-space:nowrap">${escapeHtml(s)}</td>`;
  const head = [th("IM"), th("Empresa"), th("Ref/Servicio"), th("Apertura"), th(dimLabel), th("Asignado"), th("Estatus"), th("Grupo")].join("");
  const body = rows
    .map((r) =>
      `<tr>${[
        td(r.incidentId),
        td(r.company),
        td(r.serviceId),
        td(new Date(r.openTime).toLocaleString("es-MX", { hour12: false })),
        td(dimField === "state" ? r.state : r.district),
        td(r.assignee ?? "—"),
        td(r.status),
        td(r.group),
      ].join("")}</tr>`
    )
    .join("");
  return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;color:#e2e8f0">
<caption style="font-weight:bold;text-align:left;padding-bottom:8px;font-size:14px;color:#f8fafc">${escapeHtml(title)}</caption>
<thead><tr>${head}</tr></thead>
<tbody>${body}</tbody>
</table>`;
}

async function fetchTopDetail(
  topName: string,
  dimensionField: "state" | "district",
  group?: string
): Promise<OpenIncidentRow[]> {
  const params = new URLSearchParams();
  if (group && group !== "ALL") params.set("group", group);
  params.set(dimensionField, topName);
  params.set("limit", "500");
  params.set("collapse", "false"); // detalle a nivel sitio
  const res = await fetch(`/api/incidents/open?${params}`);
  if (!res.ok) throw new Error("Error al obtener detalle");
  const json = await res.json();
  return (json.data ?? []) as OpenIncidentRow[];
}

export function TopByDimension({
  title,
  dimensionLabel,
  dimensionField = "state",
  rows,
  total,
  fileBase,
  group,
  limit = 12,
}: {
  title: string;
  dimensionLabel: string;
  dimensionField?: "state" | "district";
  rows: TopRow[];
  total: number;
  fileBase: string;
  group?: string;
  limit?: number;
}) {
  const [copied, setCopied] = useState(false);
  const [loadingExport, setLoadingExport] = useState(false);
  const [rowLoading, setRowLoading] = useState<string | null>(null);

  // 1 registro por incidente: ordenamos y graficamos por incidentes únicos.
  const sorted = [...rows].sort((a, b) => b.incidents - a.incidents);
  const top = sorted.slice(0, limit);
  const max = Math.max(1, ...top.map((r) => r.incidents));

  const topEntry = sorted[0]; // el que más tiene

  async function onCopy() {
    if (!topEntry) return;
    setLoadingExport(true);
    try {
      const detail = await fetchTopDetail(topEntry.name, dimensionField, group);
      const html = detailToHTML(
        detail,
        `${title} — ${topEntry.name} (${detail.length} incidentes)`,
        dimensionLabel,
        dimensionField
      );
      const plain = detail
        .map((r) => `${r.incidentId}\t${r.company}\t${r.serviceId}\t${new Date(r.openTime).toLocaleString("es-MX")}\t${dimensionField === "state" ? r.state : r.district}\t${r.assignee ?? ""}\t${r.status}`)
        .join("\n");
      if (await copyHTMLTable(html, plain)) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } finally {
      setLoadingExport(false);
    }
  }

  // Descarga el Excel (todos los campos) de un estado/distrito específico
  async function downloadDetail(name: string) {
    setRowLoading(name);
    try {
      const detail = await fetchTopDetail(name, dimensionField, group);
      await downloadXLSX(
        `${fileBase}-${name.toLowerCase().replace(/\s+/g, "-")}.xlsx`,
        name.slice(0, 28),
        detailCols(dimensionField),
        detailToRows(detail, dimensionField),
      );
    } finally {
      setRowLoading(null);
    }
  }

  async function onExport() {
    if (!topEntry) return;
    setLoadingExport(true);
    try {
      const detail = await fetchTopDetail(topEntry.name, dimensionField, group);
      await downloadXLSX(
        `${fileBase}-${topEntry.name.toLowerCase().replace(/\s+/g, "-")}.xlsx`,
        topEntry.name.slice(0, 28),
        detailCols(dimensionField),
        detailToRows(detail, dimensionField),
      );
    } finally {
      setLoadingExport(false);
    }
  }

  return (
    <div className="rounded-xl border border-border/60 bg-surface/60 p-4 backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <span className="font-mono text-xs text-text-muted">{total} incidentes</span>
      </div>

      <div className="space-y-1.5">
        {top.length === 0 && (
          <p className="py-6 text-center text-xs text-text-muted">Sin datos</p>
        )}
        {top.map((r, idx) => {
          const v = r.incidents;
          const color = PALETTE[idx % PALETTE.length];
          const isLoading = rowLoading === r.name;
          return (
            <button
              key={r.name}
              type="button"
              onClick={() => downloadDetail(r.name)}
              disabled={isLoading}
              title={`Descargar CSV de ${r.name}`}
              className="group flex w-full items-center gap-2 rounded px-1 py-0.5 transition-colors hover:bg-surface-elevated/50"
            >
              <span className="flex w-40 shrink-0 items-center gap-1 truncate text-left text-xs text-text-primary" title={r.name}>
                {isLoading ? (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
                ) : (
                  <Download className="h-3 w-3 shrink-0 text-text-muted/0 transition-colors group-hover:text-accent" />
                )}
                <span className="truncate">{r.name}</span>
              </span>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-surface-elevated/60">
                <div
                  className="absolute inset-y-0 left-0 rounded transition-all duration-500 group-hover:opacity-90"
                  style={{ width: `${(v / max) * 100}%`, backgroundColor: color, opacity: 0.55 }}
                />
              </div>
              <span
                className="w-10 shrink-0 text-right font-mono text-xs font-semibold"
                style={{ color }}
              >
                {v}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-text-muted/70">
        Tip: haz click en cualquier barra para bajar el Excel de ese {dimensionLabel.toLowerCase()}.
      </p>

      <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
        <div className="text-xs text-text-muted">
          <span className="font-semibold text-text-primary">{total}</span> incidentes
          {topEntry && (
            <span className="ml-2 text-text-muted/70">
              · detalle: <span className="text-text-primary">{topEntry.name}</span>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCopy}
            disabled={loadingExport || !topEntry}
            className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
          >
            {loadingExport ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : copied ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copiado" : "Copiar correo"}
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={loadingExport || !topEntry}
            className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
          >
            {loadingExport ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Excel detalle
          </button>
        </div>
      </div>
    </div>
  );
}
