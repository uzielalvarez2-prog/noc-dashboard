import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { canAccessMonitoring } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// Cancelar un recordatorio antes de que se envíe. No se borra la fila (queda
// como historial con cancelledAt) — el worker la ignora al procesar.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await ctx.params;
  try {
    const item = await db.scheduledWhatsappMessage.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (item.sentAt) {
      return NextResponse.json({ error: "Ya se envió, no se puede cancelar" }, { status: 409 });
    }
    if (item.cancelledAt) {
      return NextResponse.json({ item });
    }

    const updated = await db.scheduledWhatsappMessage.update({
      where: { id },
      data: { cancelledAt: new Date() },
    });

    await db.auditLog
      .create({ data: { userId: session.id, action: "CANCEL_SCHEDULED_WHATSAPP", targetId: id } })
      .catch(() => {});

    return NextResponse.json({ item: updated });
  } catch (err) {
    console.error("[DELETE /api/scheduled-whatsapp/:id]", err);
    return NextResponse.json({ error: "Error al cancelar" }, { status: 500 });
  }
}
