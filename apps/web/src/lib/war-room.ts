import { db } from "@/lib/db";

// Un status cuenta como "recuperado / UP" si contiene resolv o resuelt.
// Todo lo demás se considera caído / pendiente.
export function isResolvedStatus(status: string | null | undefined): boolean {
  return /resolv|resuelt/i.test(status ?? "");
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

// El prefijo alfabético del Incident ID (antes de los dígitos finales) es la
// "Siglas IM" que usa el equipo para identificar clientes, ej. "IMSEDP003090" → "IMSEDP".
function incidentPrefix(incidentId: string): string {
  return norm(incidentId.replace(/\d+$/, ""));
}

export interface OpenRecordLite {
  incidentId: string;
  openTime: Date;
  status: string;
  company: string;
  serviceId: string;
  state: string;
  district: string;
  assignee: string | null;
  group: string;
}

// Compara el snapshot de abiertos contra la base de Clientes TOP. Cada incidente
// cuya empresa O servicio coincida se persiste/actualiza en WarRoomIncident.
// El match se hace en memoria (la base es chica: ~93→300 filas). Devuelve cuántos
// incidentes únicos coincidieron.
export async function syncWarRoom(records: OpenRecordLite[]): Promise<number> {
  const clientes = await db.clienteTop.findMany({
    select: { company: true, serviceRef: true, siglasIm: true },
  });
  if (clientes.length === 0) return 0;

  const companySet = new Set<string>();
  const serviceSet = new Set<string>();
  const siglasSet = new Set<string>();
  for (const c of clientes) {
    const co = norm(c.company);
    const sv = norm(c.serviceRef);
    const si = norm(c.siglasIm);
    if (co) companySet.add(co);
    if (sv) serviceSet.add(sv);
    if (si) siglasSet.add(si);
  }

  // Una fila por incidente (un incidente abarca varios sitios).
  const byId = new Map<string, OpenRecordLite>();
  for (const r of records) if (!byId.has(r.incidentId)) byId.set(r.incidentId, r);

  const now = new Date();
  let matched = 0;

  for (const inc of byId.values()) {
    const co = norm(inc.company);
    const sv = norm(inc.serviceId);
    const prefix = incidentPrefix(inc.incidentId);
    const companyMatch = co.length > 0 && companySet.has(co);
    const serviceMatch = sv.length > 0 && serviceSet.has(sv);
    // Siglas IM: compara contra el prefijo del Incident ID (formato estándar)
    // y contra Empresa (algunos clientes se identifican por su acrónimo ahí).
    const siglasMatch = (prefix.length > 0 && siglasSet.has(prefix)) || (co.length > 0 && siglasSet.has(co));
    if (!companyMatch && !serviceMatch && !siglasMatch) continue;
    matched++;

    const hits = [companyMatch && "company", serviceMatch && "service", siglasMatch && "siglas"].filter(Boolean);
    const matchedBy = hits.length > 1 ? "both" : (hits[0] as string);
    const resolved = isResolvedStatus(inc.status);

    // Preservar la primera hora de recuperación; si se reabre, se limpia.
    const existing = await db.warRoomIncident.findUnique({
      where: { incidentId: inc.incidentId },
      select: { resolvedAt: true },
    });
    const resolvedAt = resolved ? existing?.resolvedAt ?? now : null;

    await db.warRoomIncident.upsert({
      where: { incidentId: inc.incidentId },
      create: {
        incidentId: inc.incidentId,
        openTime: inc.openTime,
        status: inc.status,
        company: inc.company,
        serviceId: inc.serviceId,
        state: inc.state,
        district: inc.district,
        assignee: inc.assignee,
        group: inc.group,
        matchedBy,
        resolvedAt,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        status: inc.status,
        company: inc.company,
        serviceId: inc.serviceId,
        state: inc.state,
        district: inc.district,
        assignee: inc.assignee,
        group: inc.group,
        matchedBy,
        resolvedAt,
        lastSeenAt: now,
      },
    });
  }

  return matched;
}
