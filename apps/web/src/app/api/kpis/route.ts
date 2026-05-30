import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getKPIs, getIncidentTrend } from "@/lib/queries/incidents";

export async function GET() {
  const session = await auth();
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
