import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canAccessMonitoring } from "@/lib/permissions";
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

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as {
      ip?: string;
      company?: string;
      serviceRef?: string;
      siglasIm?: string;
      label?: string;
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
      note: (body.note ?? "").trim() || null,
      notifyEnabled: Boolean(body.notifyEnabled),
      notifyChatIds: Array.isArray(body.notifyChatIds)
        ? body.notifyChatIds.filter((c) => typeof c === "string" && c.trim())
        : [],
    };

    const monitoredIp = await db.monitoredIp.upsert({
      where: { ip_company: { ip, company } },
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
