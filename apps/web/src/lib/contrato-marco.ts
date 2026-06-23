import { db } from "@/lib/db";

export function isResolvedStatus(status: string | null | undefined): boolean {
  return /resolv|resuelt/i.test(status ?? "");
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
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

// Compara el snapshot de abiertos contra la base de Contrato Marco.
// Match por company, serviceRef o siglasIm. Persiste en ContratoMarcoIncident.
export async function syncContratoMarco(records: OpenRecordLite[]): Promise<number> {
  const clientes = await db.contratoMarco.findMany({
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

  const byId = new Map<string, OpenRecordLite>();
  for (const r of records) if (!byId.has(r.incidentId)) byId.set(r.incidentId, r);

  const now = new Date();
  let matched = 0;

  for (const inc of byId.values()) {
    const co = norm(inc.company);
    const sv = norm(inc.serviceId);
    const companyMatch = co.length > 0 && companySet.has(co);
    const serviceMatch = sv.length > 0 && serviceSet.has(sv);
    const siglasMatch = co.length > 0 && siglasSet.has(co);
    if (!companyMatch && !serviceMatch && !siglasMatch) continue;
    matched++;

    const matchedBy = companyMatch && serviceMatch ? "both" : companyMatch ? "company" : serviceMatch ? "service" : "siglas";
    const resolved = isResolvedStatus(inc.status);

    const existing = await db.contratoMarcoIncident.findUnique({
      where: { incidentId: inc.incidentId },
      select: { resolvedAt: true },
    });
    const resolvedAt = resolved ? existing?.resolvedAt ?? now : null;

    await db.contratoMarcoIncident.upsert({
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
