"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { User, Copy, Check } from "lucide-react";
import type { OperatorStats } from "@/lib/queries/operators";
import { copyElementAsImage } from "@/lib/copyImage";

// Paleta vibrante por estatus. Primero por palabra clave (semántica), luego un
// hash estable para que cualquier estatus nuevo tenga siempre el mismo color.
const KEYWORD_STYLES: { kw: string; bg: string; text: string; dot: string }[] = [
  { kw: "PROGRESS", bg: "bg-amber-500/15", text: "text-amber-300", dot: "bg-amber-400" },
  { kw: "PENDING VENDOR", bg: "bg-violet-500/15", text: "text-violet-300", dot: "bg-violet-400" },
  { kw: "PENDING CUSTOMER", bg: "bg-sky-500/15", text: "text-sky-300", dot: "bg-sky-400" },
  { kw: "PENDING", bg: "bg-blue-500/15", text: "text-blue-300", dot: "bg-blue-400" },
  { kw: "ASSIGNED", bg: "bg-cyan-500/15", text: "text-cyan-300", dot: "bg-cyan-400" },
  { kw: "ACCEPTED", bg: "bg-teal-500/15", text: "text-teal-300", dot: "bg-teal-400" },
  { kw: "REOPEN", bg: "bg-rose-500/15", text: "text-rose-300", dot: "bg-rose-400" },
  { kw: "RESOLVED", bg: "bg-emerald-500/15", text: "text-emerald-300", dot: "bg-emerald-400" },
  { kw: "WORK", bg: "bg-orange-500/15", text: "text-orange-300", dot: "bg-orange-400" },
];

const GROUP_BADGE: Record<string, string> = {
  PEXA: "bg-accent/15 text-accent",
  CECOR: "bg-warning/15 text-warning",
  Bot: "bg-fuchsia-500/15 text-fuchsia-300",
};

const FALLBACK = [
  { bg: "bg-fuchsia-500/15", text: "text-fuchsia-300", dot: "bg-fuchsia-400" },
  { bg: "bg-lime-500/15", text: "text-lime-300", dot: "bg-lime-400" },
  { bg: "bg-indigo-500/15", text: "text-indigo-300", dot: "bg-indigo-400" },
  { bg: "bg-pink-500/15", text: "text-pink-300", dot: "bg-pink-400" },
];

function statusStyle(status: string) {
  const s = status.toUpperCase();
  for (const k of KEYWORD_STYLES) if (s.includes(k.kw)) return k;
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return FALLBACK[hash % FALLBACK.length];
}

// Estatus por el que se está filtrando la vista (si hay uno activo), para
// resaltarlo dentro de la tarjeta y mostrar su total de forma destacada.
export function OperatorCard({
  op,
  activeStatus,
}: {
  op: OperatorStats;
  activeStatus?: string | null;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "done">("idle");

  async function handleCopy() {
    if (!cardRef.current || copyState === "copying") return;
    setCopyState("copying");
    try {
      await copyElementAsImage(cardRef.current, `operador-${op.login}.png`);
      setCopyState("done");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("idle");
    }
  }

  const activeCount = activeStatus
    ? op.statuses.find((s) => s.status === activeStatus)?.count ?? 0
    : null;
  const activeStyle = activeStatus ? statusStyle(activeStatus) : null;

  return (
    <div
      ref={cardRef}
      className="relative rounded-lg border border-border bg-surface p-5 transition-colors hover:bg-surface-elevated"
    >
      <button
        type="button"
        onClick={handleCopy}
        data-copy-ignore
        title="Copiar tarjeta como imagen"
        className="absolute right-3 top-3 rounded-md border border-border bg-surface p-1.5 text-text-muted transition-colors hover:border-accent hover:text-accent"
      >
        {copyState === "done" ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Header: login + en línea + grupos + carga */}
      <div className="flex items-start justify-between gap-2 pr-8">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated">
            <User className="h-4 w-4 text-text-muted" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-success" />
          </div>
          <div>
            <p className="font-mono text-sm font-semibold text-text-primary">{op.login}</p>
            <p className="text-[10px] uppercase tracking-wider text-success">en línea</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {op.groups.map((g) => (
            <span
              key={g}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                GROUP_BADGE[g] ?? "bg-warning/15 text-warning"
              )}
            >
              {g}
            </span>
          ))}
          <span
            title={activeStatus ? `Total en ${activeStatus}` : "Total de incidentes abiertos"}
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-sm font-bold",
              activeStyle
                ? cn(activeStyle.bg, activeStyle.text)
                : op.openCount > 5
                  ? "bg-warning/15 text-warning"
                  : "bg-surface-elevated text-text-primary"
            )}
          >
            {activeStatus ? activeCount : op.openCount}
          </span>
        </div>
      </div>

      <div className="my-3 h-px bg-border" />

      {activeStatus && activeStyle ? (
        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-md px-3 py-2",
            activeStyle.bg
          )}
        >
          <span className={cn("flex items-center gap-2 truncate text-xs font-semibold", activeStyle.text)}>
            <span className={cn("h-2 w-2 rounded-full", activeStyle.dot)} />
            {activeStatus}
          </span>
          <span className={cn("font-mono text-lg font-bold", activeStyle.text)}>{activeCount}</span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {op.statuses.map((s) => {
            const st = statusStyle(s.status);
            return (
              <span
                key={s.status}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium",
                  st.bg,
                  st.text
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
                <span className="truncate max-w-[10rem]">{s.status}</span>
                <span className="font-mono font-bold">{s.count}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
