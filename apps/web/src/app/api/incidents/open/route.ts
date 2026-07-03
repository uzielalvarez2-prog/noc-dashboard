import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { getOpenIncidents } from "@/lib/queries/openIncidents";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  try {
    const result = await getOpenIncidents({
      q: sp.get("q") ?? undefined,
      group: sp.get("group") ?? undefined,
      state: sp.get("state") ?? undefined,
      district: sp.get("district") ?? undefined,
      assignee: sp.get("assignee") ?? undefined,
      status: sp.get("status") ?? undefined,
      page: Number(sp.get("page") ?? "1"),
      limit: Number(sp.get("limit") ?? "50"),
      collapse: sp.get("collapse") !== "false",
      maxAgeHours: Number(sp.get("maxAgeHours") ?? "") || undefined,
      order: sp.get("order") === "asc" ? "asc" : "desc",
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET /api/incidents/open]", err);
    return NextResponse.json({ error: "Error al obtener incidentes" }, { status: 500 });
  }
}
