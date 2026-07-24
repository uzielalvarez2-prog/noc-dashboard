import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// SISA: tickets del vendor cruzados contra los incidentes abiertos actuales.
// Solo se devuelven los tickets SISA cuyo incidentId siga presente en
// OpenIncident (no importa el status), y el "Asignado" se toma en vivo de ahí
// (OpenIncident se reemplaza cada 5 min por el scraper; SisaTicket no lo trae).
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const tickets = await db.sisaTicket.findMany({ orderBy: { uploadedAt: "desc" } });
    if (tickets.length === 0) return NextResponse.json({ items: [] });

    const open = await db.openIncident.findMany({
      where: { incidentId: { in: tickets.map((t) => t.incidentId) } },
      select: { incidentId: true, status: true, assignee: true, group: true },
    });

    // Varias filas de OpenIncident pueden compartir incidentId (falla masiva
    // multi-sitio); nos quedamos con la primera para status/asignado/grupo.
    const openById = new Map<string, { status: string; assignee: string | null; group: string }>();
    for (const o of open) {
      if (!openById.has(o.incidentId)) openById.set(o.incidentId, o);
    }

    const items = tickets
      .filter((t) => openById.has(t.incidentId))
      .map((t) => {
        const o = openById.get(t.incidentId)!;
        return {
          incidentId: t.incidentId,
          company: t.company,
          vendor: t.vendor,
          vendorTicket: t.vendorTicket,
          status: o.status,
          assignee: o.assignee,
          group: o.group,
        };
      });

    return NextResponse.json({ items });
  } catch (err) {
    console.error("[GET /api/sisa]", err);
    return NextResponse.json({ error: "Error al obtener SISA" }, { status: 500 });
  }
}
