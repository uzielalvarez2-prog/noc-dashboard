import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canVerCaseSanJuan, canEditarEstatusCase, isRolCase } from "@/lib/permissions";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// El CASE tal cual lo entrega HPSM en el export de SISA (columna CASE).
const CASE_VENDOR = "CASE SAN JUAN";
const MAX_NOTA = 4000;

// Incidentes SISA del CASE SAN JUAN que siguen abiertos, con su bitácora
// "Estatus CASE". Mismo cruce que /api/sisa: el ticket aporta CASE y folio SISA;
// Abiertos aporta empresa, servicio, sitio y estatus HPSM.
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canVerCaseSanJuan(session.role)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  try {
    const tickets = await db.sisaTicket.findMany({
      where: { vendor: { equals: CASE_VENDOR, mode: "insensitive" } },
      select: { incidentId: true, vendorTicket: true },
      // Cruce interno (no se devuelve tal cual): la tabla guarda tickets viejos
      // además de los abiertos; lo que sale al cliente son solo los abiertos.
      orderBy: { uploadedAt: "desc" },
      take: 1000,
    });
    const ids = tickets.map((t) => t.incidentId);

    const [open, notas] = await Promise.all([
      db.openIncident.findMany({
        where: { incidentId: { in: ids } },
        select: {
          incidentId: true,
          openTime: true,
          status: true,
          company: true,
          serviceId: true,
          siteName: true,
        },
      }),
      db.caseNota.findMany({
        where: { incidentId: { in: ids } },
        orderBy: { createdAt: "desc" },
        select: { id: true, incidentId: true, texto: true, autor: true, createdAt: true },
      }),
    ]);

    // Un IM multi-distrito trae varias filas en Abiertos (mismo sitio): se toma
    // la primera, igual que la vista SISA.
    const openById = new Map<string, (typeof open)[number]>();
    for (const o of open) if (!openById.has(o.incidentId)) openById.set(o.incidentId, o);

    const notasById = new Map<string, typeof notas>();
    for (const n of notas) {
      const lista = notasById.get(n.incidentId) ?? [];
      lista.push(n);
      notasById.set(n.incidentId, lista);
    }

    const items = tickets
      // Solo servicios numéricos (IDN, ej. 5521242661): los que empiezan con
      // letra (C00-…, A02-…) no los atiende el CASE San Juan.
      .filter((t) => /^\d/.test((openById.get(t.incidentId)?.serviceId ?? "").trim()))
      .map((t) => {
        const o = openById.get(t.incidentId)!;
        return {
          incidentId: t.incidentId,
          openTime: o.openTime,
          company: o.company,
          serviceId: o.serviceId,
          siteName: o.siteName,
          vendorTicket: t.vendorTicket,
          status: o.status,
          notas: notasById.get(t.incidentId) ?? [],
        };
      })
      .sort((a, b) => a.openTime.getTime() - b.openTime.getTime());

    // El rol CASE no tiene acceso a HPSM: su vista no liga el IM a HPSM.
    return NextResponse.json({
      items,
      puedeEditar: canEditarEstatusCase(session.role),
      abreHpsm: !isRolCase(session.role),
    });
  } catch (err) {
    console.error("[GET /api/case-san-juan]", err);
    return NextResponse.json({ error: "Error al leer CASE San Juan" }, { status: 500 });
  }
}

// Agrega una entrada a la bitácora "Estatus CASE" de un incidente.
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canEditarEstatusCase(session.role)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { incidentId?: unknown; texto?: unknown } | null;
  const incidentId = typeof body?.incidentId === "string" ? body.incidentId.trim() : "";
  const texto = typeof body?.texto === "string" ? body.texto.trim() : "";
  if (!incidentId || !texto) return NextResponse.json({ error: "Falta el incidente o la nota" }, { status: 400 });
  if (texto.length > MAX_NOTA) {
    return NextResponse.json({ error: `La nota excede ${MAX_NOTA} caracteres` }, { status: 400 });
  }

  try {
    const ticket = await db.sisaTicket.findFirst({
      where: { incidentId, vendor: { equals: CASE_VENDOR, mode: "insensitive" } },
      select: { incidentId: true },
    });
    if (!ticket) return NextResponse.json({ error: "El incidente no es del CASE San Juan" }, { status: 404 });

    const autor = session.name || session.email;

    const nota = await db.caseNota.create({
      data: { incidentId, texto, userId: session.id, autor },
      select: { id: true, incidentId: true, texto: true, autor: true, createdAt: true },
    });
    await db.auditLog.create({
      data: { userId: session.id, action: "CASE_NOTA_CREATE", targetId: incidentId, metadata: { notaId: nota.id } },
    });
    return NextResponse.json({ nota });
  } catch (err) {
    console.error("[POST /api/case-san-juan]", err);
    return NextResponse.json({ error: "No se pudo guardar la nota" }, { status: 500 });
  }
}
