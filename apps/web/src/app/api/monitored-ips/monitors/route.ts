import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canAccessMonitoring } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getActiveMonitorsForIncidents } from "@/lib/queries/monitoredIps";

export const dynamic = "force-dynamic";

// GET ?incidentIds=A,B,C — estado de monitoreo activo para un lote de incidentes
// (pinta el badge en la tabla de Incidentes Abiertos).
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const incidentIds = (req.nextUrl.searchParams.get("incidentIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const monitors = await getActiveMonitorsForIncidents(incidentIds);
    return NextResponse.json({ monitors });
  } catch (err) {
    console.error("[GET /api/monitored-ips/monitors]", err);
    return NextResponse.json({ error: "Error al cargar monitoreos" }, { status: 500 });
  }
}

// POST — activar monitoreo para un incidente. Crea/actualiza la MonitoredIp base
// si hace falta, y crea el IpMonitor (active, upSince:null, alertedAt:null).
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as {
      incidentId?: string;
      ip?: string;
      company?: string;
      serviceRef?: string;
      siglasIm?: string;
    };

    const incidentId = (body.incidentId ?? "").trim();
    const ip = (body.ip ?? "").trim();
    const company = (body.company ?? "").trim();
    if (!incidentId || !ip || !company) {
      return NextResponse.json(
        { error: "incidentId, ip y company son requeridos" },
        { status: 400 },
      );
    }

    const existingActive = await db.ipMonitor.findFirst({
      where: { incidentId, active: true },
    });
    if (existingActive) {
      return NextResponse.json(
        { error: "Este incidente ya tiene un monitoreo activo" },
        { status: 409 },
      );
    }

    const serviceRef = (body.serviceRef ?? "").trim();

    // Se busca por (empresa, servicio) porque esa es la identidad del enlace; la IP
    // es el valor que se actualiza. Buscar por IP haría que un servicio reusara la
    // fila de otro servicio de la misma empresa (ver comentario en schema.prisma).
    const monitoredIp = await db.monitoredIp.upsert({
      where: { company_serviceRef: { company, serviceRef } },
      create: {
        ip,
        company,
        serviceRef,
        siglasIm: (body.siglasIm ?? "").trim(),
        createdBy: session.id,
      },
      update: { ip },
    });

    const monitor = await db.ipMonitor.create({
      data: {
        monitoredIpId: monitoredIp.id,
        incidentId,
        company,
        activatedBy: session.id,
      },
    });

    await db.auditLog
      .create({
        data: {
          userId: session.id,
          action: "ACTIVATE_IP_MONITOR",
          targetId: monitor.id,
          metadata: { incidentId, ip, company },
        },
      })
      .catch(() => {});

    return NextResponse.json({ monitor }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/monitored-ips/monitors]", err);
    return NextResponse.json({ error: "Error al activar el monitoreo" }, { status: 500 });
  }
}
