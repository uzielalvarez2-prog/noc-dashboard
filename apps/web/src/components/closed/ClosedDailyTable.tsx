"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Copy, Check } from "lucide-react";
import type { ClosedDayPoint } from "@/types/closed";
import { copyHTMLTable } from "@/lib/openExport";
import { downloadXLSX } from "@/lib/excelExport";
import { cn } from "@/lib/utils";

// Las claves de día son UTC (ver getClosedByDay): se formatean en UTC para que
// "2026-11-13" se muestre como 13-nov sin importar la zona del navegador.
const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MON = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DOW[dt.getUTCDay()]} ${String(d).padStart(2, "0")} ${MON[m - 1]}`;
}

function fmtMins(mins: number): string {
  if (mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}

function complianceColor(pct: number): string {
  return pct >= 90 ? "text-success" : pct >= 70 ? "text-warning" : "text-critical";
}

async function fetchDays(group: string): Promise<ClosedDayPoint[]> {
  const res = await fetch(`/api/incidents/closed/daily?group=${group}`);
  if (!res.ok) throw new Error("Error al obtener la serie diaria");
  const data = (await res.json()) as { days: ClosedDayPoint[] };
  return data.days;
}

export function ClosedDailyTable({
  group,
  selectedDay,
  onSelectDay,
}: {
  group: string;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const { data: days = [], isLoading } = useQuery<ClosedDayPoint[]>({
    queryKey: ["closed-daily", group],
    queryFn: () => fetchDays(group),
    refetchInterval: 240_000,
  });

  const headers = ["Fecha", "Cerrados", "SLA %", "Cumplidos", "Vencidos", "Tiempo prom.", "Analista top", "Cierres top"];
  const toCells = (d: ClosedDayPoint): (string | number)[] => [
    d.day,
    d.total,
    d.compliance,
    d.cumplidos,
    d.vencidos,
    fmtMins(d.avgResolutionMins),
    d.topUser ?? "—",
    d.topUserCount,
  ];

  async function onCopy() {
    const head = `<tr>${headers.map((h) => `<th align="left">${h}</th>`).join("")}</tr>`;
    const body = days
      .map((d) => `<tr>${toCells(d).map((c) => `<td>${c}</td>`).join("")}</tr>`)
      .join("");
    const html = `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><thead>${head}</thead><tbody>${body}</tbody></table>`;
    const plain = [headers.join("\t"), ...days.map((d) => toCells(d).join("\t"))].join("\n");
    if (await copyHTMLTable(html, plain)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  function onExport() {
    downloadXLSX(
      `cerrados-por-dia-${group.toLowerCase()}.xlsx`,
      "Cerrados por día",
      headers,
      days.map(toCells),
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-surface/60 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Cierres por día</h3>
          <p className="text-xs text-text-muted">
            {group} · jornada 07:00–22:00 · desde el 13 nov
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      <div className="max-h-[520px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-elevated text-xs uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Fecha</th>
              <th className="px-3 py-2 text-right font-medium">Cerrados</th>
              <th className="px-3 py-2 text-right font-medium">SLA</th>
              <th className="px-3 py-2 text-right font-medium">Prom.</th>
              <th className="px-4 py-2 text-left font-medium">Analista top</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-text-muted">
                  Cargando…
                </td>
              </tr>
            )}
            {!isLoading && days.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-text-muted">
                  Aún no hay días en el histórico (arranca el 13 nov).
                </td>
              </tr>
            )}
            {days.map((d) => (
              <tr
                key={d.day}
                onClick={() => onSelectDay(d.day)}
                className={cn(
                  "cursor-pointer border-t border-border/40 transition-colors hover:bg-surface-elevated/60",
                  selectedDay === d.day && "bg-accent/10",
                )}
              >
                <td className="px-4 py-2 text-left font-medium text-text-primary">{fmtDay(d.day)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-text-primary">{d.total}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", complianceColor(d.compliance))}>
                  {d.compliance}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-text-muted">
                  {fmtMins(d.avgResolutionMins)}
                </td>
                <td className="px-4 py-2 text-left text-text-muted">
                  {d.topUser ? `${d.topUser} (${d.topUserCount})` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
