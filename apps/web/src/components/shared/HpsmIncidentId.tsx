"use client";

import type { ReactNode } from "react";
import { cn, hpsmIncidentUrl } from "@/lib/utils";

/**
 * Folio de incidente que abre HPSM al hacer DOBLE CLIC.
 *
 * Reutiliza SIEMPRE la misma pestaña del navegador (window name "hpsm"): cada
 * doble clic re-navega esa pestaña al nuevo IM en lugar de abrir una nueva. Como
 * es el mismo navegador, comparte la sesión/login de HPSM, así que no vuelve a
 * pedir usuario por cada incidente (si la sesión sigue activa).
 *
 * La afordancia visual (cursor, subrayado y color de acento al pasar el mouse)
 * es igual en todas las tablas; el estilo de texto base lo pone cada tabla vía
 * `className` para conservar su color/peso.
 */
export function HpsmIncidentId({
  incidentId,
  className,
  title = "Doble clic para abrir en HPSM",
  children,
}: {
  incidentId: string;
  className?: string;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <span
      onDoubleClick={() => window.open(hpsmIncidentUrl(incidentId), "hpsm")}
      title={title}
      className={cn(
        "cursor-pointer select-none underline-offset-2 hover:text-accent hover:underline",
        className
      )}
    >
      {children ?? incidentId}
    </span>
  );
}
