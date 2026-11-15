import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { getClosedByDay } from "@/lib/queries/closedIncidents";

export const dynamic = "force-dynamic";

// Serie diaria de cierres (histórico por día, jornada 07:00–22:00) para un grupo.
// Default PEXA — hoy la vista diaria solo cubre PEXA.
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const group = req.nextUrl.searchParams.get("group") ?? "PEXA";
    const days = await getClosedByDay(group);
    return NextResponse.json({ days });
  } catch (err) {
    console.error("[GET /api/incidents/closed/daily]", err);
    return NextResponse.json({ error: "Error al obtener la serie diaria" }, { status: 500 });
  }
}
