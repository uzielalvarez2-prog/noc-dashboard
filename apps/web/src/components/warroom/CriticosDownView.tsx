"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusCardsTable, type StatusCardItem } from "@/components/shared/StatusCardsTable";

interface WarRoomItem {
  incidentId: string;
  openTime: string;
  status: string;
  company: string;
  serviceId: string;
  state: string;
  district: string;
  assignee: string | null;
  group: string;
  matchedBy: string;
  flagged: boolean;
  note: string;
  resolvedAt: string | null;
  firstSeenAt: string;
  recurrence: number;
}

function isResolvedStatus(status: string | null | undefined): boolean {
  return /resolv|resuelt/i.test(status ?? "");
}

async function fetchWarRoom(): Promise<{ items: WarRoomItem[] }> {
  const res = await fetch("/api/war-room");
  if (!res.ok) throw new Error("Error al cargar War Room");
  return res.json();
}

export function CriticosDownView() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["war-room"],
    queryFn: fetchWarRoom,
    refetchInterval: 60_000,
  });

  const items: StatusCardItem[] = useMemo(
    () =>
      (data?.items ?? [])
        .filter((it) => !Boolean(it.resolvedAt) && !isResolvedStatus(it.status))
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
          note: it.note,
          recurrence: it.recurrence,
        })),
    [data]
  );

  async function patch(it: StatusCardItem, body: Partial<{ flagged: boolean; note: string; dismissed: boolean }>) {
    qc.setQueryData<{ items: WarRoomItem[] }>(["war-room"], (old) =>
      old
        ? {
            items: body.dismissed
              ? old.items.filter((x) => x.incidentId !== it.incidentId)
              : old.items.map((x) => (x.incidentId === it.incidentId ? { ...x, ...body } : x)),
          }
        : old
    );
    try {
      await fetch("/api/war-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId: it.incidentId, ...body }),
      });
    } catch {
      qc.invalidateQueries({ queryKey: ["war-room"] });
    }
  }

  return (
    <StatusCardsTable
      items={items}
      isLoading={isLoading}
      totalLabel="Clientes TOP caídos"
      onPatch={patch}
      fileBase="wsp-clientes"
    />
  );
}
