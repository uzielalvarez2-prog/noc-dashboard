import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// War Room: incidentes de Clientes TOP. Devuelve los activos (sin resolver) +
// los vistos en los últimos 7 días, para analizar recurrencia por cliente.
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rows = await db.warRoomIncident.findMany({
      where: {
        OR: [{ resolvedAt: null }, { firstSeenAt: { gte: sevenDaysAgo } }],
      },
      orderBy: [{ resolvedAt: "asc" }, { openTime: "desc" }],
    });

    // Recurrencia: cuántos incidentes (en la ventana) por empresa|servicio.
    const recur = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.company.toLowerCase()}|${r.serviceId.toLowerCase()}`;
      recur.set(key, (recur.get(key) ?? 0) + 1);
    }

    const items = rows.map((r) => ({
      incidentId: r.incidentId,
      openTime: r.openTime.toISOString(),
      status: r.status,
      company: r.company,
      serviceId: r.serviceId,
      state: r.state,
      district: r.district,
      assignee: r.assignee,
      group: r.group,
      matchedBy: r.matchedBy,
      flagged: r.flagged,
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
      firstSeenAt: r.firstSeenAt.toISOString(),
      recurrence: recur.get(`${r.company.toLowerCase()}|${r.serviceId.toLowerCase()}`) ?? 1,
    }));

    return NextResponse.json({ items });
  } catch (err) {
    console.error("[GET /api/war-room]", err);
    return NextResponse.json({ error: "Error al obtener War Room" }, { status: 500 });
  }
}

// Marcar/desmarcar la bandera manual de un incidente.
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = (await req.json()) as { incidentId?: string; flagged?: boolean };
    const incidentId = (body.incidentId ?? "").trim();
    if (!incidentId)
      return NextResponse.json({ error: "incidentId requerido" }, { status: 400 });

    await db.warRoomIncident.update({
      where: { incidentId },
      data: { flagged: Boolean(body.flagged) },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/war-room]", err);
    return NextResponse.json({ error: "Error al actualizar bandera" }, { status: 500 });
  }
}
