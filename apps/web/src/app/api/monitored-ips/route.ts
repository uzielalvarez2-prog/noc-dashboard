import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canAccessMonitoring, canCaptureMonitoredIp } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getMonitoredIps } from "@/lib/queries/monitoredIps";

export const dynamic = "force-dynamic";

// Monitoreo de IP — base persistente IP↔empresa. ADMIN-only (ver permissions.ts).

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const q = req.nextUrl.searchParams.get("q") ?? undefined;
    const items = await getMonitoredIps({ q });
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[GET /api/monitored-ips]", err);
    return NextResponse.json({ error: "Error al cargar IPs monitoreadas" }, { status: 500 });
  }
}

// Alta/corrección de la IP de un servicio. Abierto a todos los roles: se llama
// desde la columna IP/Monitoreo de Total EDC. El GET de arriba (catálogo completo)
// y el DELETE siguen siendo ADMIN.
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canCaptureMonitoredIp(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as {
      ip?: string;
      company?: string;
      serviceRef?: string;
      siglasIm?: string;
      label?: string;
      kind?: string;
      note?: string;
      notifyEnabled?: boolean;
      notifyChatIds?: string[];
    };

    const ip = (body.ip ?? "").trim();
    const company = (body.company ?? "").trim();
    if (!ip || !company) {
      return NextResponse.json({ error: "IP y empresa son requeridos" }, { status: 400 });
    }

    const data = {
      ip,
      company,
      serviceRef: (body.serviceRef ?? "").trim(),
      siglasIm: (body.siglasIm ?? "").trim(),
      label: (body.label ?? "").trim(),
      kind: body.kind === "VPN" ? "VPN" : "PING",
      note: (body.note ?? "").trim() || null,
      notifyEnabled: Boolean(body.notifyEnabled),
      notifyChatIds: Array.isArray(body.notifyChatIds)
        ? body.notifyChatIds.filter((c) => typeof c === "string" && c.trim())
        : [],
    };

    // Clave por (empresa, servicio): al corregir la IP de un servicio se actualiza
    // esa fila en vez de crear una nueva (ver comentario en schema.prisma).
    const monitoredIp = await db.monitoredIp.upsert({
      where: { company_serviceRef: { company, serviceRef: data.serviceRef } },
      create: { ...data, createdBy: session.id },
      update: data,
    });

    await db.auditLog
      .create({
        data: {
          userId: session.id,
          action: "UPSERT_MONITORED_IP",
          targetId: monitoredIp.id,
          metadata: { ip: monitoredIp.ip, company: monitoredIp.company },
        },
      })
      .catch(() => {});

    return NextResponse.json({ monitoredIp }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/monitored-ips]", err);
    return NextResponse.json({ error: "Error al guardar la IP" }, { status: 500 });
  }
}
