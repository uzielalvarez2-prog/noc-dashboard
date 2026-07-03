"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { EdcWhatsappView } from "./EdcWhatsappView";
import { EdcStatusView } from "./EdcStatusView";

type SubTab = "whatsapp" | "escalados";

// Pestaña EDC dividida en dos sub-secciones:
//  1. "Reportes WhatsApp" (primera, default): copias del grupo STAFF SUPERVISIÓN.
//  2. "Escalados": la vista de escalados EDC de siempre (intacta).
export function EdcTabs() {
  const [tab, setTab] = useState<SubTab>("whatsapp");

  const subBtn = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
      active
        ? "bg-accent text-white"
        : "border border-border text-text-muted hover:text-text-primary"
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setTab("whatsapp")}
          className={subBtn(tab === "whatsapp")}
        >
          Reportes WhatsApp
        </button>
        <button
          type="button"
          onClick={() => setTab("escalados")}
          className={subBtn(tab === "escalados")}
        >
          Total EDC
        </button>
      </div>

      {tab === "whatsapp" ? <EdcWhatsappView /> : <EdcStatusView />}
    </div>
  );
}
