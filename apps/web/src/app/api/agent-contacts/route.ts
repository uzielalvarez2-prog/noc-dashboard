import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { canManageAgentContacts } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// Contactos de agentes: nombre de HPSM → teléfono de WhatsApp, para @mencionar al
// asignado en la alerta de servicio activo. ADMIN estricto (ver permissions.ts).

/** HPSM no garantiza mayúsculas estables entre exports; la llave es minúsculas. */
function normalizeHpsmName(value: string): string {
  return value.trim().toLowerCase();
}

/** Deja sólo dígitos: se acepta pegar "+52 1 55 1234 5678" y queda utilizable. */
function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function requireAdmin(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (!canManageAgentContacts(session.role)) {
    return { error: NextResponse.json({ error: "Sin permiso" }, { status: 403 }) };
  }
  return { session };
}

export async function GET(req: NextRequest) {
  const { error } = requireAdmin(req);
  if (error) return error;

  const contacts = await db.agentContact.findMany({ orderBy: { hpsmName: "asc" } });
  return NextResponse.json({ contacts });
}

export async function POST(req: NextRequest) {
  const { session, error } = requireAdmin(req);
  if (error) return error;

  const body = (await req.json().catch(() => null)) as {
    hpsmName?: unknown;
    displayName?: unknown;
    phone?: unknown;
  } | null;

  const hpsmName = normalizeHpsmName(typeof body?.hpsmName === "string" ? body.hpsmName : "");
  const phone = normalizePhone(typeof body?.phone === "string" ? body.phone : "");
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";

  if (!hpsmName) {
    return NextResponse.json({ error: "El nombre de HPSM es requerido" }, { status: 400 });
  }
  // Un número sin código de país no genera un JID válido y la mención saldría como
  // texto plano, así que se rechaza aquí en vez de fallar silencioso al enviar.
  if (phone.length < 10) {
    return NextResponse.json(
      { error: "Teléfono inválido: incluye el código de país, ej. 5215512345678" },
      { status: 400 },
    );
  }

  const data = { displayName, phone };
  const contact = await db.agentContact.upsert({
    where: { hpsmName },
    create: { hpsmName, ...data, createdBy: session.id },
    update: data,
  });

  await db.auditLog
    .create({
      data: {
        userId: session.id,
        action: "UPSERT_AGENT_CONTACT",
        targetId: contact.id,
        metadata: { hpsmName: contact.hpsmName },
      },
    })
    .catch(() => {});

  return NextResponse.json({ contact }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { session, error } = requireAdmin(req);
  if (error) return error;

  const body = (await req.json().catch(() => null)) as {
    id?: unknown;
    displayName?: unknown;
    phone?: unknown;
    enabled?: unknown;
  } | null;

  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const data: { displayName?: string; phone?: string; enabled?: boolean } = {};
  if (typeof body?.displayName === "string") data.displayName = body.displayName.trim();
  if (typeof body?.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body?.phone === "string") {
    const phone = normalizePhone(body.phone);
    if (phone.length < 10) {
      return NextResponse.json(
        { error: "Teléfono inválido: incluye el código de país, ej. 5215512345678" },
        { status: 400 },
      );
    }
    data.phone = phone;
  }

  const contact = await db.agentContact.update({ where: { id }, data }).catch(() => null);
  if (!contact) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

  await db.auditLog
    .create({
      data: {
        userId: session.id,
        action: "UPDATE_AGENT_CONTACT",
        targetId: contact.id,
        metadata: { hpsmName: contact.hpsmName, enabled: contact.enabled },
      },
    })
    .catch(() => {});

  return NextResponse.json({ contact });
}

export async function DELETE(req: NextRequest) {
  const { session, error } = requireAdmin(req);
  if (error) return error;

  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  await db.agentContact.delete({ where: { id } }).catch(() => {});
  await db.auditLog
    .create({ data: { userId: session.id, action: "DELETE_AGENT_CONTACT", targetId: id } })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
