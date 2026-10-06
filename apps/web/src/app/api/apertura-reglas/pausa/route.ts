import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canAccessMonitoring } from "@/lib/permissions";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Interruptor global de la alerta de apertura: { pausado: boolean }.
export async function PUT(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as { pausado?: unknown };
    if (typeof body.pausado !== "boolean") {
      return NextResponse.json({ error: "pausado debe ser true/false" }, { status: 400 });
    }

    const config = await db.aperturaConfig.upsert({
      where: { id: "global" },
      create: { id: "global", pausado: body.pausado, updatedBy: session.id },
      update: { pausado: body.pausado, updatedBy: session.id },
    });

    await db.auditLog
      .create({
        data: {
          userId: session.id,
          action: config.pausado ? "PAUSE_APERTURA_ALERTAS" : "RESUME_APERTURA_ALERTAS",
          targetId: "global",
        },
      })
      .catch(() => {});

    return NextResponse.json({ pausado: config.pausado });
  } catch (err) {
    console.error("[PUT /api/apertura-reglas/pausa]", err);
    return NextResponse.json({ error: "Error al cambiar el interruptor" }, { status: 500 });
  }
}
