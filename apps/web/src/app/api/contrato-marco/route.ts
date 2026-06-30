import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Contrato Marco: incidentes de clientes con contrato marco.
// Devuelve activos (sin resolver) + recuperados en las últimas 12 horas.
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

    const rows = await db.contratoMarcoIncident.findMany({
      where: {
        dismissed: false,
        OR: [{ resolvedAt: null }, { resolvedAt: { gte: twelveHoursAgo } }],
      },
      orderBy: [{ resolvedAt: "asc" }, { openTime: "desc" }],
    });

    // Auto-resolución: incidentes DOWN que ya no están en el snapshot de abiertos
    // (se cerraron en HPSM sin pasar por un status "Resolved" en el CSV) se marcan
    // con resolvedAt=ahora, igual que hace War Room.
    const downIds = rows.filter((r) => r.resolvedAt === null).map((r) => r.incidentId);
    const resolvedNow = new Map<string, Date>();
    if (downIds.length > 0) {
      const stillOpen = await db.openIncident.findMany({
        where: { incidentId: { in: downIds } },
        select: { incidentId: true },
      });
      const openSet = new Set(stillOpen.map((r) => r.incidentId));
      const gone = downIds.filter((id) => !openSet.has(id));
      if (gone.length > 0) {
        const now = new Date();
        await db.contratoMarcoIncident.updateMany({
          where: { incidentId: { in: gone }, resolvedAt: null },
          data: { resolvedAt: now },
        });
        for (const id of gone) resolvedNow.set(id, now);
      }
    }

    const recur = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.company.toLowerCase()}|${r.serviceId.toLowerCase()}`;
      recur.set(key, (recur.get(key) ?? 0) + 1);
    }

    const items = rows.map((r) => {
      const effectiveResolvedAt = resolvedNow.get(r.incidentId) ?? r.resolvedAt;
      return {
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
        resolvedAt: effectiveResolvedAt ? effectiveResolvedAt.toISOString() : null,
        firstSeenAt: r.firstSeenAt.toISOString(),
        recurrence: recur.get(`${r.company.toLowerCase()}|${r.serviceId.toLowerCase()}`) ?? 1,
      };
    });

    return NextResponse.json({ items });
  } catch (err) {
    console.error("[GET /api/contrato-marco]", err);
    return NextResponse.json({ error: "Error al obtener Contrato Marco" }, { status: 500 });
  }
}

// Actualizar un incidente: bandera, nota o descarte.
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

    await db.contratoMarcoIncident.update({ where: { incidentId }, data });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/contrato-marco]", err);
    return NextResponse.json({ error: "Error al actualizar incidente" }, { status: 500 });
  }
}
