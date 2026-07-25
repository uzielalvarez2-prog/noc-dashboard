import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { canAccessSettings } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// GET — lista los grupos destino. Cualquier usuario autenticado (para llenar el
// selector de envío). Por defecto solo los habilitados; ?all=1 trae todos (para
// la vista de administración).
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const all = req.nextUrl.searchParams.get("all") === "1" && canAccessSettings(session.role);
  const groups = await db.whatsappGroup.findMany({
    where: all ? undefined : { enabled: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ groups });
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH — editar un grupo existente (nota / habilitar-deshabilitar). Solo
// SUPERVISOR/ADMIN. Los grupos NO se agregan a mano: se auto-descubren cuando
// wa-listener ve un mensaje de ellos. Aquí solo se ajusta lo administrable.
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessSettings(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    id?: unknown;
    note?: unknown;
    enabled?: unknown;
  } | null;

  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const data: { note?: string | null; enabled?: boolean } = {};
  if (typeof body?.note === "string") data.note = body.note.trim() || null;
  if (typeof body?.enabled === "boolean") data.enabled = body.enabled;

  const group = await db.whatsappGroup.update({ where: { id }, data }).catch(() => null);
  if (!group) return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });

  await db.auditLog
    .create({
      data: {
        userId: session.id,
        action: "UPDATE_WHATSAPP_GROUP",
        targetId: group.id,
        metadata: { name: group.name, enabled: group.enabled },
      },
    })
    .catch(() => {});

  return NextResponse.json({ group });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — quitar un grupo de la whitelist (?id=...). Solo SUPERVISOR/ADMIN.
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessSettings(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  await db.whatsappGroup.delete({ where: { id } }).catch(() => {});
  await db.auditLog
    .create({ data: { userId: session.id, action: "DELETE_WHATSAPP_GROUP", targetId: id } })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
