import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { getMonthlyIncidentTrend } from "@/lib/queries/closedIncidents";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const group = req.nextUrl.searchParams.get("group") ?? "PEXA";
  try {
    const trend = await getMonthlyIncidentTrend(group);
    return NextResponse.json(trend);
  } catch (err) {
    console.error("[GET /api/incidents/monthly-trend]", err);
    return NextResponse.json({ error: "Error al obtener tendencia mensual" }, { status: 500 });
  }
}
