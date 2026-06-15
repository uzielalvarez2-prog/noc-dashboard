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

export async function GET(req: NextRequest) {
  if (!adminOnly(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const users = await db.user.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const session = adminOnly(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { name, email, role, password } = await req.json() as {
    name?: string; email?: string; role?: string; password?: string;
  };

  if (!name?.trim() || !email?.trim() || !password?.trim() || !role) {
    return NextResponse.json({ error: "Todos los campos son requeridos" }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role as UserRole)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email: email.trim() } });
  if (existing) return NextResponse.json({ error: "El email ya está registrado" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.user.create({
    data: { name: name.trim(), email: email.trim(), role: role as UserRole, passwordHash },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  await db.auditLog.create({
    data: {
      userId: session.id,
      action: "CREATE_USER",
      targetId: user.id,
      metadata: { email: user.email, role: user.role },
    },
  });

  return NextResponse.json({ user }, { status: 201 });
}
