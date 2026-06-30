"use client";

import { useState } from "react";
import { Siren, ShieldCheck } from "lucide-react";
import { ClientesTopPanel } from "./ClientesTopPanel";
import { cn } from "@/lib/utils";

type Base = "wsp" | "cm";

const SUBTITLE: Record<Base, string> = {
  wsp: "Base de clientes críticos (WSP). Cuando un incidente abierto coincide con una empresa, servicio o siglas IM de esta lista, entra a War Room → Serv. Críticos y lanza una alerta.",
  cm: "Base de clientes con Contrato Marco. Cuando un incidente abierto coincide con una empresa, servicio o siglas IM de esta lista, entra a War Room → Contrato Marco y lanza una alerta.",
};

export function ClientesTopTabs() {
  const [base, setBase] = useState<Base>("wsp");

  const tabBtn = (b: Base) =>
    cn(
      "flex items-center gap-2 rounded-lg border border-blue-400/50 bg-blue-500/10 px-3 py-2 transition-all",
      base === b
        ? "ring-2 ring-blue-400 shadow-[0_0_10px_2px_rgba(96,165,250,0.4)]"
        : "opacity-60 hover:opacity-100"
    );

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">{SUBTITLE[base]}</p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setBase("wsp")} className={tabBtn("wsp")}>
          <Siren className="h-4 w-4 text-blue-400 drop-shadow-[0_0_4px_rgba(96,165,250,0.8)]" />
          <span className="text-sm font-semibold text-blue-300">WSP</span>
        </button>
        <button type="button" onClick={() => setBase("cm")} className={tabBtn("cm")}>
          <ShieldCheck className="h-4 w-4 text-blue-400 drop-shadow-[0_0_4px_rgba(96,165,250,0.8)]" />
          <span className="text-sm font-semibold text-blue-300">Contrato Marco</span>
        </button>
      </div>

      {base === "wsp" ? (
        <ClientesTopPanel
          key="wsp"
          apiBase="/api/clientes-top"
          queryKey="clientes-top"
          invalidateKeys={["war-room"]}
          heading="Base de clientes críticos (WSP)"
        />
      ) : (
        <ClientesTopPanel
          key="cm"
          apiBase="/api/contrato-marco-clientes"
          queryKey="contrato-marco-clientes"
          invalidateKeys={["contrato-marco"]}
          heading="Base de clientes — Contrato Marco"
        />
      )}
    </div>
  );
}
