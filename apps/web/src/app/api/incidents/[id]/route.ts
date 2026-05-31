import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { getIncidentById } from "@/lib/queries/incidents";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(_req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const incident = await getIncidentById(id);

  if (!incident) {
    return NextResponse.json({ error: "Incidente no encontrado" }, { status: 404 });
  }

  // Audit log
  await db.auditLog.create({
    data: {
      userId: session.id,
      action: "VIEW_INCIDENT",
      targetId: id,
      metadata: { incidentId: id },
    },
  }).catch(() => {});

  return NextResponse.json(incident);
}
