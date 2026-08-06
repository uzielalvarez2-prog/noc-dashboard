import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canAccessMonitoring, canCaptureMonitoredIp } from "@/lib/permissions";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Corregir una IP ya registrada — abierto a todos los roles (columna IP/Monitoreo
// de Total EDC). El DELETE de abajo sigue siendo ADMIN: borrar arrastra el
// historial de monitoreos y no debe estar al alcance de cualquiera.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canCaptureMonitoredIp(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as {
      ip?: string;
      company?: string;
      serviceRef?: string;
      siglasIm?: string;
      label?: string;
      kind?: string;
      note?: string;
      notifyEnabled?: boolean;
      notifyChatIds?: string[];
    };

    const data: Record<string, unknown> = {};
    if (typeof body.ip === "string") data.ip = body.ip.trim();
    if (typeof body.company === "string") data.company = body.company.trim();
    if (typeof body.serviceRef === "string") data.serviceRef = body.serviceRef.trim();
    if (typeof body.siglasIm === "string") data.siglasIm = body.siglasIm.trim();
    if (typeof body.label === "string") data.label = body.label.trim();
    if (body.kind === "VPN" || body.kind === "PING") data.kind = body.kind;
    if (typeof body.note === "string") data.note = body.note.trim() || null;
    if (typeof body.notifyEnabled === "boolean") data.notifyEnabled = body.notifyEnabled;
    if (Array.isArray(body.notifyChatIds)) {
      data.notifyChatIds = body.notifyChatIds.filter((c) => typeof c === "string" && c.trim());
    }

    // Solo el "no existe" es 404. Tragarse cualquier otro error (ej. P2002 por
    // chocar con la clave (company, serviceRef)) lo disfrazaba de "No encontrada"
    // y ocultaba la causa real en la UI.
    const monitoredIp = await db.monitoredIp.update({ where: { id }, data }).catch((e: unknown) => {
      const code = (e as { code?: string }).code;
      if (code === "P2025") return null;
      throw e;
    });
    if (!monitoredIp) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    await db.auditLog
      .create({
        data: {
          userId: session.id,
          action: "UPDATE_MONITORED_IP",
          targetId: monitoredIp.id,
          metadata: { ip: monitoredIp.ip, company: monitoredIp.company },
        },
      })
      .catch(() => {});

    return NextResponse.json({ monitoredIp });
  } catch (err) {
    console.error("[PATCH /api/monitored-ips/:id]", err);
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Ya existe una IP registrada para ese servicio de la empresa" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Error al actualizar la IP" }, { status: 500 });
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
    const activeMonitor = await db.ipMonitor.findFirst({
      where: { monitoredIpId: id, active: true },
      select: { id: true },
    });
    if (activeMonitor) {
      return NextResponse.json(
        { error: "Esta IP tiene un monitoreo activo. Desactívalo antes de borrarla." },
        { status: 409 },
      );
    }

    // Los IpMonitor ya desactivados siguen apuntando a esta IP por FK: sin borrarlos
    // primero, el delete revienta con P2003. Van juntos en una transacción para no
    // dejar el historial huérfano si el segundo paso falla.
    await db.$transaction([
      db.ipMonitor.deleteMany({ where: { monitoredIpId: id } }),
      db.monitoredIp.delete({ where: { id } }),
    ]);

    await db.auditLog
      .create({ data: { userId: session.id, action: "DELETE_MONITORED_IP", targetId: id } })
      .catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/monitored-ips/:id]", err);
    return NextResponse.json({ error: "Error al eliminar la IP" }, { status: 500 });
  }
}
