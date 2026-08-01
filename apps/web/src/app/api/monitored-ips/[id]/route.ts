import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canAccessMonitoring } from "@/lib/permissions";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
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
    if (typeof body.note === "string") data.note = body.note.trim() || null;
    if (typeof body.notifyEnabled === "boolean") data.notifyEnabled = body.notifyEnabled;
    if (Array.isArray(body.notifyChatIds)) {
      data.notifyChatIds = body.notifyChatIds.filter((c) => typeof c === "string" && c.trim());
    }

    const monitoredIp = await db.monitoredIp.update({ where: { id }, data }).catch(() => null);
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
