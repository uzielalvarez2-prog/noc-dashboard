import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSLAMetrics } from "@/lib/queries/sla";

export async function GET() {
  const session = await auth();
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
