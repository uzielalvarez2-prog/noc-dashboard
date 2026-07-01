import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Escalados: marcas manuales de atención especial. GET devuelve las marcas y los
// datos vivos del snapshot de abiertos; si el incidente ya no está en el
// snapshot (se cerró), se reporta con stillOpen=false para que el panel lo
// distinga en lugar de desaparecerlo en silencio.
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const marks = await db.escalatedIncident.findMany({ orderBy: { createdAt: "asc" } });
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
            group: true,
          },
        })
      : [];

    // Un incidente abarca varios sitios — basta una fila por incidente
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
        assignee: live?.assignee ?? null,
        status: live?.status ?? "CERRADO / FUERA DE COLA",
        company: live?.company ?? "—",
        group: live?.group ?? null,
        stillOpen: Boolean(live),
        markedBy: m.markedBy,
        markedAt: m.createdAt.toISOString(),
        note: m.note ?? null,
        flagged: m.flagged,
      };
    });

    return NextResponse.json({ marked: ids, items });
  } catch (err) {
    console.error("[GET /api/incidents/escalated]", err);
    return NextResponse.json({ error: "Error al obtener escalados" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = (await req.json()) as {
      incidentId?: string;
      escalated?: boolean;
      note?: string;
      flag?: boolean;
    };
    const incidentId = (body.incidentId ?? "").trim();
    if (!incidentId)
      return NextResponse.json({ error: "incidentId requerido" }, { status: 400 });

    // Alternar solo la bandera visual, sin tocar el estado de escalado. Upsert
    // (no update) para poder marcar bandera en incidentes aún no escalados
    // (p.ej. los que vienen de WhatsApp en EDC → Escalados).
    if (typeof body.flag === "boolean") {
      await db.escalatedIncident.upsert({
        where: { incidentId },
        create: { incidentId, markedBy: session.id, flagged: body.flag },
        update: { flagged: body.flag },
      });
      return NextResponse.json({ ok: true });
    }

    if (body.escalated) {
      await db.escalatedIncident.upsert({
        where: { incidentId },
        create: { incidentId, markedBy: session.id, note: body.note ?? null },
        update: { note: body.note ?? null },
      });
    } else {
      await db.escalatedIncident.deleteMany({ where: { incidentId } });
    }

    await db.auditLog
      .create({
        data: {
          userId: session.id,
          action: body.escalated ? "ESCALATE_INCIDENT" : "UNESCALATE_INCIDENT",
          metadata: { incidentId, note: body.note },
        },
      })
      .catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/incidents/escalated]", err);
    return NextResponse.json({ error: "Error al actualizar escalado" }, { status: 500 });
  }
}
