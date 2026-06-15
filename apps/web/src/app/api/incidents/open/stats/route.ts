import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { getOpenStats } from "@/lib/queries/openIncidents";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const sp = req.nextUrl.searchParams;
    const maxAge = Number(sp.get("maxAgeHours") ?? "") || undefined;
    const stats = await getOpenStats(sp.get("group") ?? undefined, maxAge);
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[GET /api/incidents/open/stats]", err);
    return NextResponse.json({ error: "Error al obtener estadística" }, { status: 500 });
  }
}
