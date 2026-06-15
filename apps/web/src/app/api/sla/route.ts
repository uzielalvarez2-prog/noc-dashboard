import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { getSLAMetrics } from "@/lib/queries/sla";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const metrics = await getSLAMetrics();
    return NextResponse.json(metrics);
  } catch (err) {
    console.error("[GET /api/sla]", err);
    return NextResponse.json(
      { error: "Error interno al calcular métricas SLA" },
      { status: 500 }
    );
  }
}
