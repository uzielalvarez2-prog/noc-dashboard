import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canAccessMonitoring } from "@/lib/permissions";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Desactivar manualmente un monitoreo (escape hatch, ej. IP capturada por error).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await ctx.params;
  try {
    const monitor = await db.ipMonitor
      .update({
        where: { id },
        data: { active: false, deactivatedAt: new Date(), deactivatedReason: "manual" },
      })
      .catch(() => null);
    if (!monitor) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    await db.auditLog
      .create({
        data: { userId: session.id, action: "DEACTIVATE_IP_MONITOR", targetId: monitor.id },
      })
      .catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/monitored-ips/monitors/:id]", err);
    return NextResponse.json({ error: "Error al desactivar el monitoreo" }, { status: 500 });
  }
}
