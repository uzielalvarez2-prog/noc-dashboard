"use client";

import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusCardsTable, type StatusCardItem } from "@/components/shared/StatusCardsTable";
import { canCaptureMonitoredIp } from "@/lib/permissions";
import { IpMonitorCell } from "./IpMonitorCell";
import {
  fetchMonitoredIpMatches,
  fetchActiveMonitors,
  pickIpMatch,
  indexMonitorsByIncident,
} from "@/lib/ipMonitoring";

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

  // Columna "IP / Monitoreo" — aquí la ven TODOS los roles, para que quien esté de
  // turno pueda cargar la IP de un enlace caído y ponerlo a monitorear sin esperar
  // al ADMIN. En Incidentes Abiertos sigue siendo ADMIN-only.
  const [role, setRole] = useState<string | undefined>();
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setRole(d.role))
      // Sin rol la columna simplemente no se pinta, que es indistinguible de
      // "no eres ADMIN": si el fetch falla hay que poder verlo en la consola.
      .catch((e) => console.error("[EdcStatusView] no se pudo leer el rol", e));
  }, []);
  const showMonitoring = canCaptureMonitoredIp(role);

  const companies = useMemo(() => [...new Set(items.map((i) => i.company))], [items]);
  const incidentIds = useMemo(() => items.map((i) => i.incidentId), [items]);

  const { data: ipMatches } = useQuery({
    queryKey: ["monitored-ips-lookup", companies],
    queryFn: () => fetchMonitoredIpMatches(companies),
    enabled: showMonitoring && companies.length > 0,
  });

  const { data: activeMonitors } = useQuery({
    queryKey: ["ip-monitors", incidentIds],
    queryFn: () => fetchActiveMonitors(incidentIds),
    enabled: showMonitoring && incidentIds.length > 0,
    refetchInterval: 20_000,
  });
  const monitorByIncident = indexMonitorsByIncident(activeMonitors);

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
      neonStatus
      showNote={false}
      showFlag={false}
      renderIpCell={
        showMonitoring
          ? (it) => (
              <IpMonitorCell
                incidentId={it.incidentId}
                company={it.company}
                serviceId={it.serviceId}
                match={pickIpMatch(ipMatches?.[it.company.trim().toLowerCase()], it.serviceId)}
                monitor={monitorByIncident.get(it.incidentId)}
              />
            )
          : undefined
      }
    />
  );
}
