import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { getEdcEscaladoItems } from "@/lib/queries/edcReports";

export const dynamic = "force-dynamic";

// GET — items para EDC → Escalados: los incidentes que llegan por WhatsApp,
// con sus datos vivos de abiertos, para la tabla original de EDC. Requiere sesión.
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const items = await getEdcEscaladoItems();
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[GET /api/edc-reports/escalados]", err);
    return NextResponse.json({ error: "Error al obtener escalados EDC" }, { status: 500 });
  }
}
