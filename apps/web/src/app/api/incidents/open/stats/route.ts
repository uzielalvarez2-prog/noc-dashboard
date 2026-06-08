import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { getOpenStats } from "@/lib/queries/openIncidents";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const stats = await getOpenStats(req.nextUrl.searchParams.get("group") ?? undefined);
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[GET /api/incidents/open/stats]", err);
    return NextResponse.json({ error: "Error al obtener estadística" }, { status: 500 });
  }
}
