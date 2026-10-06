import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canAccessMonitoring } from "@/lib/permissions";
import { db } from "@/lib/db";
import { invalidarSuspendidos } from "@/lib/wa-suspendidos";

export const dynamic = "force-dynamic";

// Grupos de WhatsApp suspendidos: ningún aviso automático se les entrega
// (apertura, ACTIVO, posible baja, programados). ADMIN estricto.

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const groups = await db.whatsappGroup.findMany({
    where: { suspendido: true },
    select: { id: true, chatId: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ groups });
}

/** { chatId, suspendido } — suspende o reactiva un grupo. */
export async function PUT(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as { chatId?: unknown; suspendido?: unknown };
    const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
    if (!chatId || typeof body.suspendido !== "boolean") {
      return NextResponse.json({ error: "chatId y suspendido (true/false) son requeridos" }, { status: 400 });
    }

    const group = await db.whatsappGroup
      .update({ where: { chatId }, data: { suspendido: body.suspendido } })
      .catch((e: unknown) => {
        if ((e as { code?: string }).code === "P2025") return null;
        throw e;
      });
    if (!group) return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
    invalidarSuspendidos();

    await db.auditLog
      .create({
        data: {
          userId: session.id,
          action: group.suspendido ? "SUSPEND_WA_GROUP" : "RESUME_WA_GROUP",
          targetId: group.id,
          metadata: { chatId: group.chatId, name: group.name },
        },
      })
      .catch(() => {});

    return NextResponse.json({ group: { id: group.id, chatId: group.chatId, name: group.name, suspendido: group.suspendido } });
  } catch (err) {
    console.error("[PUT /api/whatsapp/groups/suspendidos]", err);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}
