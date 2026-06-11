import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { getClosedStats } from "@/lib/queries/closedIncidents";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  try {
    const stats = await getClosedStats({
      group: sp.get("group") ?? undefined,
      from: sp.get("from") ? new Date(sp.get("from")!) : undefined,
      to: sp.get("to") ? new Date(sp.get("to")!) : undefined,
    });
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[GET /api/incidents/closed/stats]", err);
    return NextResponse.json({ error: "Error al obtener estadística" }, { status: 500 });
  }
}
