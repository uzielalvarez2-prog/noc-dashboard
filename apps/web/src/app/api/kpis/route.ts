import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { getKPIs, getIncidentTrend } from "@/lib/queries/incidents";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const [kpis, trend] = await Promise.all([getKPIs(), getIncidentTrend()]);
    return NextResponse.json({ ...kpis, trend });
  } catch (err) {
    console.error("[GET /api/kpis]", err);
    return NextResponse.json(
      { error: "Error interno al obtener KPIs" },
      { status: 500 }
    );
  }
}
