import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// War Room: incidentes de Clientes TOP. Devuelve los activos (sin resolver) +
// los recuperados en los últimos 7 días. Excluye los descartados (X "quitar").
// El cliente separa en 3 vistas: DOWN, UP (<24h) y UP histórico (24h–7d).
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rows = await db.warRoomIncident.findMany({
      where: {
        dismissed: false,
        OR: [{ resolvedAt: null }, { resolvedAt: { gte: sevenDaysAgo } }],
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
      note: r.note ?? "",
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

// Actualizar un incidente: bandera manual, nota o descarte (X "quitar").
// Solo se tocan los campos presentes en el body (actualización parcial).
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = (await req.json()) as {
      incidentId?: string;
      flagged?: boolean;
      note?: string;
      dismissed?: boolean;
    };
    const incidentId = (body.incidentId ?? "").trim();
    if (!incidentId)
      return NextResponse.json({ error: "incidentId requerido" }, { status: 400 });

    const data: { flagged?: boolean; note?: string | null; dismissed?: boolean } = {};
    if (typeof body.flagged === "boolean") data.flagged = body.flagged;
    if (typeof body.dismissed === "boolean") data.dismissed = body.dismissed;
    if (typeof body.note === "string") data.note = body.note.trim() || null;

    if (Object.keys(data).length === 0)
      return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });

    await db.warRoomIncident.update({ where: { incidentId }, data });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/war-room]", err);
    return NextResponse.json({ error: "Error al actualizar incidente" }, { status: 500 });
  }
}
