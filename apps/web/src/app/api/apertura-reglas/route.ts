import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canAccessMonitoring } from "@/lib/permissions";
import { db } from "@/lib/db";
import { marcarAbiertosExistentes, tieneCriterios, type ReglaBody } from "@/lib/apertura-reglas";

export const dynamic = "force-dynamic";

// Reglas de la alerta de apertura — ADMIN estricto (mismo permiso que
// Monitoreo de IP / Servicios en posible baja).

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const [reglas, config] = await Promise.all([
    db.aperturaRegla.findMany({ orderBy: { createdAt: "asc" } }),
    db.aperturaConfig.findUnique({ where: { id: "global" } }),
  ]);
  return NextResponse.json({ reglas, pausado: config?.pausado ?? false });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as ReglaBody;
    const data = {
      nombre: (body.nombre ?? "").trim(),
      servicePrefixes: (body.servicePrefixes ?? "").trim(),
      imPrefixes: (body.imPrefixes ?? "").trim(),
      companyContains: (body.companyContains ?? "").trim(),
      porTurno: body.porTurno === true,
      mostrarSitio: body.mostrarSitio === true,
      notifyChatIds: Array.isArray(body.notifyChatIds)
        ? body.notifyChatIds.filter((c) => typeof c === "string" && c.trim())
        : [],
      enabled: true,
    };

    if (!data.nombre) return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    if (!tieneCriterios(data)) {
      return NextResponse.json({ error: "Llena al menos un criterio (Servicio, IM o Empresa)" }, { status: 400 });
    }
    if (!data.porTurno && data.notifyChatIds.length === 0) {
      return NextResponse.json({ error: "Elige al menos un grupo destino o 'Según turno'" }, { status: 400 });
    }

    const regla = await db.aperturaRegla.create({ data: { ...data, createdBy: session.id } });
    // Solo avisa de incidentes NUEVOS: los que hoy ya cumplen la regla se marcan sin enviar.
    const omitidos = await marcarAbiertosExistentes(regla);

    await db.auditLog
      .create({
        data: {
          userId: session.id,
          action: "CREATE_APERTURA_REGLA",
          targetId: regla.id,
          metadata: { nombre: regla.nombre, omitidos },
        },
      })
      .catch(() => {});

    return NextResponse.json({ regla, omitidos }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/apertura-reglas]", err);
    return NextResponse.json({ error: "Error al guardar la regla" }, { status: 500 });
  }
}
