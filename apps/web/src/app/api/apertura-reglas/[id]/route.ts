import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canAccessMonitoring } from "@/lib/permissions";
import { db } from "@/lib/db";
import { marcarAbiertosExistentes, tieneCriterios, type ReglaBody } from "@/lib/apertura-reglas";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await ctx.params;
  try {
    const actual = await db.aperturaRegla.findUnique({ where: { id } });
    if (!actual) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    const body = (await req.json()) as ReglaBody;
    const next = {
      nombre: typeof body.nombre === "string" ? body.nombre.trim() : actual.nombre,
      servicePrefixes: typeof body.servicePrefixes === "string" ? body.servicePrefixes.trim() : actual.servicePrefixes,
      imPrefixes: typeof body.imPrefixes === "string" ? body.imPrefixes.trim() : actual.imPrefixes,
      companyContains: typeof body.companyContains === "string" ? body.companyContains.trim() : actual.companyContains,
      porTurno: typeof body.porTurno === "boolean" ? body.porTurno : actual.porTurno,
      notifyChatIds: Array.isArray(body.notifyChatIds)
        ? body.notifyChatIds.filter((c) => typeof c === "string" && c.trim())
        : actual.notifyChatIds,
      enabled: typeof body.enabled === "boolean" ? body.enabled : actual.enabled,
    };

    if (!next.nombre) return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    if (!tieneCriterios(next)) {
      return NextResponse.json({ error: "Llena al menos un criterio (Servicio, IM o Empresa)" }, { status: 400 });
    }
    if (!next.porTurno && next.notifyChatIds.length === 0) {
      return NextResponse.json({ error: "Elige al menos un grupo destino o 'Según turno'" }, { status: 400 });
    }

    const regla = await db.aperturaRegla.update({ where: { id }, data: next });

    // Reactivada o con criterios nuevos: los incidentes que YA están abiertos y
    // ahora la cumplen se marcan sin enviar — la regla solo avisa de los nuevos.
    const reactivada = !actual.enabled && regla.enabled;
    const criteriosCambiaron =
      actual.servicePrefixes !== regla.servicePrefixes ||
      actual.imPrefixes !== regla.imPrefixes ||
      actual.companyContains !== regla.companyContains;
    const omitidos = regla.enabled && (reactivada || criteriosCambiaron) ? await marcarAbiertosExistentes(regla) : 0;

    await db.auditLog
      .create({
        data: {
          userId: session.id,
          action: "UPDATE_APERTURA_REGLA",
          targetId: regla.id,
          metadata: { nombre: regla.nombre, enabled: regla.enabled, omitidos },
        },
      })
      .catch(() => {});

    return NextResponse.json({ regla, omitidos });
  } catch (err) {
    console.error("[PATCH /api/apertura-reglas/:id]", err);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await ctx.params;
  try {
    await db.aperturaRegla.delete({ where: { id } });
    await db.auditLog
      .create({ data: { userId: session.id, action: "DELETE_APERTURA_REGLA", targetId: id } })
      .catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/apertura-reglas/:id]", err);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
