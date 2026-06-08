"use client";

import { useState } from "react";
import { OpenIncidentsView } from "@/components/open/OpenIncidentsView";
import { ClosedIncidentsView } from "@/components/closed/ClosedIncidentsView";
import { cn } from "@/lib/utils";

type Tab = "open" | "closed";

const COPY: Record<Tab, { title: string; subtitle: string }> = {
  open: {
    title: "Incidentes abiertos",
    subtitle: "PEXA + CECOR · busca por cualquier columna, detecta falla masiva y exporta",
  },
  closed: {
    title: "Incidentes cerrados",
    subtitle: "PEXA + CECOR · cumplimiento de SLA (4 h), ranking por analista y causa",
  },
};

export function IncidentsTabs() {
  const [tab, setTab] = useState<Tab>("open");
  const { title, subtitle } = COPY[tab];

  const tabBtn = (t: Tab) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      tab === t ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
    );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
          <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
        </div>
        <div className="flex shrink-0 gap-1 rounded-lg border border-border bg-surface p-1">
          <button type="button" className={tabBtn("open")} onClick={() => setTab("open")}>
            Abiertos
          </button>
          <button type="button" className={tabBtn("closed")} onClick={() => setTab("closed")}>
            Cerrados
          </button>
        </div>
      </div>

      {tab === "open" ? <OpenIncidentsView /> : <ClosedIncidentsView />}
    </div>
  );
}
