"use client";

import { useState } from "react";
import { OpenIncidentsView } from "@/components/open/OpenIncidentsView";
import { ClosedIncidentsView } from "@/components/closed/ClosedIncidentsView";
import { PageHeader } from "@/components/layout/PageHeaderProvider";
import { cn } from "@/lib/utils";

type Tab = "open" | "closed";

export function IncidentsTabs() {
  const [tab, setTab] = useState<Tab>("open");

  const tabBtn = (t: Tab) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      tab === t ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
    );

  // El título de la sección vive en el Header (PageHeader); aquí solo queda el
  // selector Abiertos / Cerrados.
  const toggle = (
    <div className="flex shrink-0 gap-1 rounded-lg border border-border bg-surface p-1">
      <button type="button" className={tabBtn("open")} onClick={() => setTab("open")}>
        Abiertos
      </button>
      <button type="button" className={tabBtn("closed")} onClick={() => setTab("closed")}>
        Cerrados
      </button>
    </div>
  );

  if (tab === "open") {
    return <OpenIncidentsView trailing={toggle} />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Incidentes cerrados"
        subtitle="PEXA + CECOR · cumplimiento de SLA (4 h), ranking por analista y causa"
      />
      <div className="flex justify-end">{toggle}</div>
      <ClosedIncidentsView />
    </div>
  );
}
