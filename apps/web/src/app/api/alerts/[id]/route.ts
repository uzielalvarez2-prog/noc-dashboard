import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const PatchSchema = z.object({
  isActive: z.boolean().optional(),
  recipients: z.array(z.string().email()).min(1).optional(),
  name: z.string().min(1).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "NOC_ADMIN") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rule = await db.alertRule.update({
    where: { id },
    data: parsed.data,
  }).catch(() => null);

  if (!rule) return NextResponse.json({ error: "Regla no encontrada" }, { status: 404 });

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: "UPDATE_ALERT_RULE",
      targetId: id,
      metadata: parsed.data as import("@prisma/client").Prisma.InputJsonValue,
    },
  }).catch(() => {});

  return NextResponse.json(rule);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "NOC_ADMIN") {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id } = await params;
  await db.alertRule.delete({ where: { id } }).catch(() => null);

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: "DELETE_ALERT_RULE",
      targetId: id,
    },
  }).catch(() => {});

  return new NextResponse(null, { status: 204 });
}
