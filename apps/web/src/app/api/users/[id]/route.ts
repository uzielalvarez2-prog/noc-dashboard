import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import type { UserRole } from "@/types";
import { ROLES, canAccessSettings } from "@/lib/permissions";

const VALID_ROLES: UserRole[] = ROLES;

function adminOnly(req: NextRequest) {
  const s = getSessionFromRequest(req);
  if (!s || !canAccessSettings(s.role)) return null;
  return s;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = adminOnly(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const { name, role, password } = await req.json() as {
    name?: string; role?: string; password?: string;
  };

  if (!name?.trim() && !role && !password?.trim()) {
    return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
  }
  if (role && !VALID_ROLES.includes(role as UserRole)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  // Evitar quitar el último admin
  if (role && role !== "ADMIN") {
    const target = await db.user.findUnique({ where: { id } });
    if (target?.role === "ADMIN") {
      const adminCount = await db.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1)
        return NextResponse.json({ error: "Debe existir al menos un administrador" }, { status: 409 });
    }
  }

  const passwordHash = password?.trim() ? await bcrypt.hash(password, 10) : undefined;
  const changedFields: string[] = [
    ...(name?.trim()   ? ["name"]     : []),
    ...(role           ? ["role"]     : []),
    ...(passwordHash   ? ["password"] : []),
  ];

  const user = await db.user.update({
    where: { id },
    data: {
      ...(name?.trim()  ? { name: name.trim() }        : {}),
      ...(role          ? { role: role as UserRole }    : {}),
      ...(passwordHash  ? { passwordHash }              : {}),
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  await db.auditLog.create({
    data: {
      userId: session.id,
      action: "UPDATE_USER",
      targetId: id,
      metadata: { fields: changedFields },
    },
  });

  return NextResponse.json({ user });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = adminOnly(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;

  if (id === session.id)
    return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 409 });

  const target = await db.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  if (target.role === "ADMIN") {
    const adminCount = await db.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1)
      return NextResponse.json({ error: "Debe existir al menos un administrador" }, { status: 409 });
  }

  await db.auditLog.create({
    data: {
      userId: session.id,
      action: "DELETE_USER",
      targetId: id,
      metadata: { email: target.email },
    },
  });

  await db.user.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
