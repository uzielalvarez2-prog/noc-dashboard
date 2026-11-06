import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canMarcarCriticos } from "@/lib/permissions";
import { db } from "@/lib/db";
import { buildEdcText } from "@/lib/sisa";

export const dynamic = "force-dynamic";

// Críticos: lista PRIVADA POR USUARIO de incidentes que un ADMIN marcó para
// seguimiento, desde cualquier vista de abiertos. GET devuelve las marcas del
// usuario en sesión + los datos vivos del snapshot de abiertos; si el incidente
// ya se cerró (no está en el snapshot) se reporta con stillOpen=false para que
// la vista lo etiquete "CERRADO / fuera de cola" en vez de desaparecerlo.
//
// Cada crítico trae además su "Formato EDC" (campo `edcText`), con esta
// prioridad: 1) la versión editada por el usuario (CriticalIncident.edcText);
// 2) el rawText del reporte de WhatsApp de ese incidente (EdcReport), si existe;
// 3) un formato armado al vuelo con buildEdcText desde SISA + abiertos.
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

    if (ids.length === 0) return NextResponse.json({ marked: [], items: [] });

    const [openRows, edcReports, sisaTickets] = await Promise.all([
      db.openIncident.findMany({
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
      }),
      db.edcReport.findMany({
        where: { incidentId: { in: ids } },
        select: { incidentId: true, rawText: true },
      }),
      db.sisaTicket.findMany({
        where: { incidentId: { in: ids } },
        select: {
          incidentId: true,
          vendor: true,
          vendorTicket: true,
          estadoEfa: true,
          fechaEstadoEms: true,
          notasEfa: true,
          estatusError: true,
        },
      }),
    ]);

    // Un incidente abarca varios sitios — basta una fila por incidente.
    const byId = new Map<string, (typeof openRows)[0]>();
    for (const r of openRows) if (!byId.has(r.incidentId)) byId.set(r.incidentId, r);
    const edcById = new Map(edcReports.map((e) => [e.incidentId, e.rawText]));
    const sisaById = new Map<string, (typeof sisaTickets)[0]>();
    for (const t of sisaTickets) if (!sisaById.has(t.incidentId)) sisaById.set(t.incidentId, t);

    const items = marks.map((m) => {
      const live = byId.get(m.incidentId);

      // Formato EDC: editado > reporte WhatsApp > generado desde SISA/abiertos.
      let edcText = m.edcText ?? null;
      let edcSource: "editado" | "whatsapp" | "generado" | "sin-datos" = "editado";
      if (!edcText) {
        const wa = edcById.get(m.incidentId);
        if (wa) {
          edcText = wa;
          edcSource = "whatsapp";
        } else if (live) {
          // Generar con buildEdcText. El folio SISA (vendor/vendorTicket y datos
          // Manto) solo existe si el incidente está en SisaTicket; si no, se
          // arma igual con lo que haya de abiertos (vendorTicket/vendor vacíos).
          const s = sisaById.get(m.incidentId);
          edcText = buildEdcText({
            incidentId: m.incidentId,
            company: live.company,
            vendorTicket: s?.vendorTicket ?? "",
            vendor: s?.vendor ?? "",
            district: live.district,
            serviceId: live.serviceId,
            openTime: live.openTime,
            fechaEstadoEms: s?.fechaEstadoEms ?? null,
            notasEfa: s?.notasEfa ?? null,
            estadoEfa: s?.estadoEfa ?? null,
            estatusError: s?.estatusError ?? null,
          });
          edcSource = "generado";
        } else {
          edcText = "";
          edcSource = "sin-datos";
        }
      }

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
        edcText,
        // Indica de dónde salió el texto (editado = guardado por el usuario).
        edcSource,
        edcEdited: Boolean(m.edcText),
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
    const body = (await req.json()) as {
      incidentId?: string;
      critical?: boolean;
      // Guardar/limpiar el texto EDC editado de un crítico ya existente. null o
      // "" borra la edición (vuelve a armarse al vuelo en el GET).
      edcText?: string | null;
    };
    const incidentId = (body.incidentId ?? "").trim();
    if (!incidentId)
      return NextResponse.json({ error: "incidentId requerido" }, { status: 400 });

    // Rama 1: guardar/limpiar el texto EDC editado (no cambia el marcado).
    if (body.edcText !== undefined) {
      const edc = body.edcText === null ? null : String(body.edcText);
      await db.criticalIncident.upsert({
        where: { userId_incidentId: { userId: session.id, incidentId } },
        create: { userId: session.id, incidentId, edcText: edc && edc.trim() ? edc : null },
        update: { edcText: edc && edc.trim() ? edc : null },
      });
      return NextResponse.json({ ok: true });
    }

    // Rama 2: marcar / desmarcar como crítico.
    if (body.critical) {
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
