import { cn } from "@/lib/utils";
import { User } from "lucide-react";
import type { OperatorStats } from "@/lib/queries/operators";

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

export function OperatorCard({ op }: { op: OperatorStats }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5 transition-colors hover:bg-surface-elevated">
      {/* Header: login + en línea + grupos + carga */}
      <div className="flex items-start justify-between gap-2">
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
                g === "PEXA" ? "bg-accent/15 text-accent" : "bg-warning/15 text-warning"
              )}
            >
              {g}
            </span>
          ))}
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-sm font-bold",
              op.openCount > 5 ? "bg-warning/15 text-warning" : "bg-surface-elevated text-text-primary"
            )}
          >
            {op.openCount}
          </span>
        </div>
      </div>

      <div className="my-3 h-px bg-border" />

      {/* Estatus como chips de colores */}
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
    </div>
  );
}
