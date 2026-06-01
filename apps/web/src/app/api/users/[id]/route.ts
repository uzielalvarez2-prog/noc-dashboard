import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

function adminOnly(req: NextRequest) {
  const s = getSessionFromRequest(req);
  if (!s || s.role !== "NOC_ADMIN") return null;
  return s;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = adminOnly(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const { name, role, password } = await req.json();

  const data: Record<string, unknown> = {};
  if (name?.trim()) data.name = name.trim();
  if (role) {
    if (!["NOC_OPERATOR", "NOC_ADMIN", "ENGINEER"].includes(role))
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    data.role = role;
  }
  if (password?.trim()) data.passwordHash = await bcrypt.hash(password, 10);

  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "Sin cambios" }, { status: 400 });

  // Evitar quitar el último admin
  if (role && role !== "NOC_ADMIN") {
    const target = await db.user.findUnique({ where: { id } });
    if (target?.role === "NOC_ADMIN") {
      const adminCount = await db.user.count({ where: { role: "NOC_ADMIN" } });
      if (adminCount <= 1) return NextResponse.json({ error: "Debe existir al menos un administrador" }, { status: 409 });
    }
  }

  const user = await db.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  await db.auditLog.create({
    data: {
      userId: session.id,
      action: "UPDATE_USER",
      targetId: id,
      metadata: { fields: Object.keys(data).filter((k) => k !== "passwordHash").concat(password ? ["password"] : []) },
    },
  });

  return NextResponse.json({ user });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = adminOnly(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;

  if (id === session.id) return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 409 });

  const target = await db.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  if (target.role === "NOC_ADMIN") {
    const adminCount = await db.user.count({ where: { role: "NOC_ADMIN" } });
    if (adminCount <= 1) return NextResponse.json({ error: "Debe existir al menos un administrador" }, { status: 409 });
  }

  await db.auditLog.create({
    data: { userId: session.id, action: "DELETE_USER", targetId: id, metadata: { email: target.email } },
  });

  await db.user.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
