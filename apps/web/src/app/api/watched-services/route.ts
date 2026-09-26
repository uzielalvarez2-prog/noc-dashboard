import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canAccessMonitoring } from "@/lib/permissions";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Servicios en "posible baja" — catálogo ADMIN estricto (mismo permiso que
// Monitoreo de IP: son alertas de bajo volumen que solo el ADMIN configura).

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const flags = await db.watchedServiceFlag.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ flags });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as {
      serviceRef?: string;
      note?: string;
      notifyChatIds?: string[];
    };

    const serviceRef = (body.serviceRef ?? "").trim();
    const notifyChatIds = Array.isArray(body.notifyChatIds)
      ? body.notifyChatIds.filter((c) => typeof c === "string" && c.trim())
      : [];
    if (!serviceRef) {
      return NextResponse.json({ error: "El número de Servicio es requerido" }, { status: 400 });
    }
    if (notifyChatIds.length === 0) {
      return NextResponse.json({ error: "Elige al menos un grupo destino" }, { status: 400 });
    }

    const data = {
      serviceRef,
      note: (body.note ?? "").trim(),
      notifyChatIds,
      enabled: true,
    };

    // Upsert por serviceRef: volver a marcar el mismo Servicio actualiza la
    // fila existente (nota/grupos/reactivación) en vez de chocar con @unique.
    const flag = await db.watchedServiceFlag.upsert({
      where: { serviceRef },
      create: { ...data, createdBy: session.id },
      update: data,
    });

    await db.auditLog
      .create({
        data: {
          userId: session.id,
          action: "UPSERT_WATCHED_SERVICE",
          targetId: flag.id,
          metadata: { serviceRef: flag.serviceRef },
        },
      })
      .catch(() => {});

    return NextResponse.json({ flag }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/watched-services]", err);
    return NextResponse.json({ error: "Error al guardar el servicio" }, { status: 500 });
  }
}
