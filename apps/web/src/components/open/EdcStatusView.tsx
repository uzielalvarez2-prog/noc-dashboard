"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusCardsTable, type StatusCardItem } from "@/components/shared/StatusCardsTable";

// Item que devuelve /api/edc-reports/escalados (lista = incidentes de WhatsApp,
// datos vivos de abiertos; nota/bandera desde EscalatedIncident).
interface EdcEscaladoItem {
  incidentId: string;
  openTime: string | null;
  status: string;
  company: string;
  serviceId: string;
  state: string;
  district: string;
  assignee: string | null;
  flagged: boolean;
  note: string;
}

async function fetchItems(): Promise<EdcEscaladoItem[]> {
  const res = await fetch("/api/edc-reports/escalados");
  if (!res.ok) throw new Error("Error al obtener escalados EDC");
  const data = (await res.json()) as { items: EdcEscaladoItem[] };
  return data.items;
}

// EDC → Escalados: los incidentes que llegan por WhatsApp, en la tabla original
// de EDC (tarjetas de estatus + tabla Nota/Quitar/🚩/Incidente…). De WhatsApp
// solo se toma el incidentId; el resto sale de abiertos. La tabla se muestra
// siempre. Nota/bandera se guardan en EscalatedIncident (vía /api/incidents/escalated);
// Quitar borra el reporte de WhatsApp (vía DELETE /api/edc-reports).
export function EdcStatusView() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<EdcEscaladoItem[]>({
    queryKey: ["edc-escalados"],
    queryFn: fetchItems,
    refetchInterval: 60_000,
  });

  const items: StatusCardItem[] = useMemo(
    () =>
      (data ?? []).map((it) => ({
        incidentId: it.incidentId,
        openTime: it.openTime,
        status: it.status,
        company: it.company,
        serviceId: it.serviceId,
        state: it.state,
        district: it.district,
        assignee: it.assignee,
        flagged: it.flagged,
        note: it.note ?? "",
      })),
    [data]
  );

  async function patch(
    it: StatusCardItem,
    body: Partial<{ flagged: boolean; note: string; dismissed: boolean }>
  ) {
    // Actualización optimista sobre la caché de esta vista.
    qc.setQueryData<EdcEscaladoItem[]>(["edc-escalados"], (old) =>
      old
        ? body.dismissed
          ? old.filter((x) => x.incidentId !== it.incidentId)
          : old.map((x) =>
              x.incidentId === it.incidentId
                ? { ...x, flagged: body.flagged ?? x.flagged, note: body.note ?? x.note }
                : x
            )
        : old
    );
    try {
      if (body.dismissed) {
        // Quitar = borrar el reporte de WhatsApp (sale de ambas vistas EDC).
        await fetch(`/api/edc-reports?incidentId=${encodeURIComponent(it.incidentId)}`, {
          method: "DELETE",
        });
      } else if (body.note !== undefined) {
        await fetch("/api/incidents/escalated", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ incidentId: it.incidentId, escalated: true, note: body.note }),
        });
      } else if (body.flagged !== undefined) {
        await fetch("/api/incidents/escalated", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ incidentId: it.incidentId, flag: body.flagged }),
        });
      }
    } finally {
      qc.invalidateQueries({ queryKey: ["edc-escalados"] });
      if (body.dismissed) qc.invalidateQueries({ queryKey: ["edc-reports"] });
    }
  }

  return (
    <StatusCardsTable
      items={items}
      isLoading={isLoading}
      totalLabel="Escalados EDC"
      onPatch={patch}
      fileBase="escalados-edc"
      alwaysShowTable
    />
  );
}
