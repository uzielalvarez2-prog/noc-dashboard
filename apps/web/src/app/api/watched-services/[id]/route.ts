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
      note?: string;
      notifyChatIds?: string[];
      enabled?: boolean;
    };

    const data: Record<string, unknown> = {};
    if (typeof body.note === "string") data.note = body.note.trim();
    if (Array.isArray(body.notifyChatIds)) {
      data.notifyChatIds = body.notifyChatIds.filter((c) => typeof c === "string" && c.trim());
    }
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;

    const flag = await db.watchedServiceFlag.update({ where: { id }, data }).catch((e: unknown) => {
      const code = (e as { code?: string }).code;
      if (code === "P2025") return null;
      throw e;
    });
    if (!flag) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    await db.auditLog
      .create({
        data: {
          userId: session.id,
          action: "UPDATE_WATCHED_SERVICE",
          targetId: flag.id,
          metadata: { serviceRef: flag.serviceRef, enabled: flag.enabled },
        },
      })
      .catch(() => {});

    return NextResponse.json({ flag });
  } catch (err) {
    console.error("[PATCH /api/watched-services/:id]", err);
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
    await db.watchedServiceFlag.delete({ where: { id } });
    await db.auditLog
      .create({ data: { userId: session.id, action: "DELETE_WATCHED_SERVICE", targetId: id } })
      .catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/watched-services/:id]", err);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
