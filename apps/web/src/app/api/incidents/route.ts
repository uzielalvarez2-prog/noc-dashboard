import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getIncidents } from "@/lib/queries/incidents";
import type { Severity, IncidentStatus } from "@/types";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? "50")));
  const severity = searchParams.get("severity") as Severity | null;
  const status = searchParams.get("status") as IncidentStatus | null;
  const assignedTo = searchParams.get("assignedTo") ?? undefined;
  const slaRisk = searchParams.get("slaRisk") === "true";

  try {
    const result = await getIncidents({
      page,
      limit,
      ...(severity && { severity }),
      ...(status && { status }),
      assignedTo,
      slaRisk,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/incidents]", err);
    return NextResponse.json(
      { error: "Error interno al obtener incidentes" },
      { status: 500 }
    );
  }
}
