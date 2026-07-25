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
// POST — agregar un grupo a la whitelist. Solo SUPERVISOR/ADMIN. El `name` debe
// coincidir EXACTO con el nombre del grupo en WhatsApp (wa-listener lo resuelve
// por nombre). Idempotente por nombre (upsert): re-agregar reactiva/actualiza.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessSettings(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    note?: unknown;
    enabled?: unknown;
  } | null;

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  const enabled = typeof body?.enabled === "boolean" ? body.enabled : true;
  if (!name) return NextResponse.json({ error: "El nombre del grupo es requerido" }, { status: 400 });

  const group = await db.whatsappGroup.upsert({
    where: { name },
    create: { name, note: note || null, enabled, createdBy: session.id },
    update: { note: note || null, enabled },
  });

  await db.auditLog
    .create({
      data: {
        userId: session.id,
        action: "UPSERT_WHATSAPP_GROUP",
        targetId: group.id,
        metadata: { name: group.name, enabled: group.enabled },
      },
    })
    .catch(() => {});

  return NextResponse.json({ group }, { status: 201 });
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
