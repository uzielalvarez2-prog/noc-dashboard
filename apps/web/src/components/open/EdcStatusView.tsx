"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusCardsTable, type StatusCardItem } from "@/components/shared/StatusCardsTable";

interface EscalatedItem {
  incidentId: string;
  openTime: string | null;
  serviceId: string;
  state: string;
  district: string;
  assignee: string | null;
  status: string;
  company: string;
  group: string | null;
  stillOpen: boolean;
  markedBy: string;
  markedAt: string;
  note: string | null;
  flagged: boolean;
}

interface EscalatedResponse {
  marked: string[];
  items: EscalatedItem[];
}

async function fetchEscalated(): Promise<EscalatedResponse> {
  const res = await fetch("/api/incidents/escalated");
  if (!res.ok) throw new Error("Error al obtener escalados");
  return res.json();
}

// Resuelto / UP: ya no está abierto o el status dice resolv/resuelt (mismo criterio que EscalatedPanel).
function isUp(it: EscalatedItem): boolean {
  return !it.stillOpen || /resolv|resuelt/i.test(it.status);
}

export function EdcStatusView() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<EscalatedResponse>({
    queryKey: ["escalated"],
    queryFn: fetchEscalated,
    refetchInterval: 60_000,
  });

  const items: StatusCardItem[] = useMemo(
    () =>
      (data?.items ?? [])
        .filter((it) => !isUp(it))
        .map((it) => ({
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

  async function patch(it: StatusCardItem, body: Partial<{ flagged: boolean; note: string; dismissed: boolean }>) {
    qc.setQueryData<EscalatedResponse>(["escalated"], (old) =>
      old
        ? {
            ...old,
            items: body.dismissed
              ? old.items.filter((x) => x.incidentId !== it.incidentId)
              : old.items.map((x) =>
                  x.incidentId === it.incidentId
                    ? { ...x, flagged: body.flagged ?? x.flagged, note: body.note ?? x.note }
                    : x
                ),
          }
        : old
    );
    try {
      if (body.dismissed) {
        await fetch("/api/incidents/escalated", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ incidentId: it.incidentId, escalated: false }),
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
      qc.invalidateQueries({ queryKey: ["escalated"] });
    }
  }

  return (
    <StatusCardsTable
      items={items}
      isLoading={isLoading}
      totalLabel="Escalados EDC"
      onPatch={patch}
      fileBase="escalados-edc"
    />
  );
}
