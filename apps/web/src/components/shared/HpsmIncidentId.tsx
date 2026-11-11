"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Folio de incidente que se COPIA al portapapeles con un clic (o doble clic).
 *
 * Antes el doble clic abría HPSM con un deep link `ctx=docEngine`, pero HPSM
 * endureció querysecurity el 2026-11-11 y esos links devuelven "Invalid query
 * hash in URL" (ya no abren el IM; hay que ir por Search Incidents a mano). Por
 * eso ahora la interacción es COPIAR el folio: un clic o doble clic lo dejan en
 * el portapapeles para pegarlo donde se necesite (p.ej. el buscador de HPSM).
 *
 * Da feedback visual breve ("✓ copiado") y cae a execCommand si el navegador no
 * expone navigator.clipboard (contextos no seguros).
 */
export function HpsmIncidentId({
  incidentId,
  className,
  title = "Clic para copiar el folio",
  children,
}: {
  incidentId: string;
  className?: string;
  title?: string;
  children?: ReactNode;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const texto = incidentId.trim();
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* sin portapapeles disponible: no romper la UI */
      }
      document.body.removeChild(ta);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1400);
  }

  return (
    <span
      onClick={copiar}
      title={copiado ? "✓ Copiado" : title}
      className={cn(
        "cursor-pointer select-none underline-offset-2 hover:text-accent hover:underline",
        copiado && "text-accent",
        className
      )}
    >
      {children ?? incidentId}
      {copiado && <span className="ml-1 text-[10px] text-accent">✓</span>}
    </span>
  );
}
