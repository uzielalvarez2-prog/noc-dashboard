import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canMarcarCriticos } from "@/lib/permissions";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Críticos: lista PRIVADA POR USUARIO de incidentes que un ADMIN marcó para
// seguimiento, desde cualquier vista de abiertos. GET devuelve las marcas del
// usuario en sesión + los datos vivos del snapshot de abiertos; si el incidente
// ya se cerró (no está en el snapshot) se reporta con stillOpen=false para que
// la vista lo etiquete "CERRADO / fuera de cola" en vez de desaparecerlo.
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canMarcarCriticos(session.role))
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  try {
    const marks = await db.criticalIncident.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "asc" },
    });
    const ids = marks.map((m) => m.incidentId);

    const openRows = ids.length
      ? await db.openIncident.findMany({
          where: { incidentId: { in: ids } },
          select: {
            incidentId: true,
            openTime: true,
            status: true,
            company: true,
            serviceId: true,
            state: true,
            assignee: true,
            district: true,
            siteName: true,
            group: true,
          },
        })
      : [];

    // Un incidente abarca varios sitios — basta una fila por incidente.
    const byId = new Map<string, (typeof openRows)[0]>();
    for (const r of openRows) if (!byId.has(r.incidentId)) byId.set(r.incidentId, r);

    const items = marks.map((m) => {
      const live = byId.get(m.incidentId);
      return {
        incidentId: m.incidentId,
        openTime: live?.openTime?.toISOString() ?? null,
        serviceId: live?.serviceId ?? "—",
        state: live?.state ?? "—",
        district: live?.district ?? "—",
        siteName: live?.siteName ?? null,
        assignee: live?.assignee ?? null,
        status: live?.status ?? "CERRADO / FUERA DE COLA",
        company: live?.company ?? "—",
        group: live?.group ?? null,
        stillOpen: Boolean(live),
        markedAt: m.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ marked: ids, items });
  } catch (err) {
    console.error("[GET /api/incidents/critical]", err);
    return NextResponse.json({ error: "Error al obtener críticos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canMarcarCriticos(session.role))
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  try {
    const body = (await req.json()) as { incidentId?: string; critical?: boolean };
    const incidentId = (body.incidentId ?? "").trim();
    if (!incidentId)
      return NextResponse.json({ error: "incidentId requerido" }, { status: 400 });

    if (body.critical) {
      // upsert sobre la clave única (userId, incidentId): marcar dos veces no
      // duplica ni falla.
      await db.criticalIncident.upsert({
        where: { userId_incidentId: { userId: session.id, incidentId } },
        create: { userId: session.id, incidentId },
        update: {},
      });
    } else {
      await db.criticalIncident.deleteMany({ where: { userId: session.id, incidentId } });
    }

    await db.auditLog
      .create({
        data: {
          userId: session.id,
          action: body.critical ? "MARK_CRITICAL" : "UNMARK_CRITICAL",
          metadata: { incidentId },
        },
      })
      .catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/incidents/critical]", err);
    return NextResponse.json({ error: "Error al actualizar crítico" }, { status: 500 });
  }
}
