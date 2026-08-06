import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canCaptureMonitoredIp } from "@/lib/permissions";
import { getMonitoredIpMatches } from "@/lib/queries/monitoredIps";

export const dynamic = "force-dynamic";

// Batch match de empresas contra la base de MonitoredIp — usado por la tabla de
// Incidentes Abiertos para prellenar la columna IP sin que el ADMIN la busque.
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canCaptureMonitoredIp(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  // Un parámetro repetido por empresa: hay nombres con coma ("BASHAM, RINGE Y
  // CORREA") y unirlos en un solo valor separado por comas los partía en dos
  // empresas inexistentes, así que su IP nunca se encontraba.
  const companies = req.nextUrl.searchParams
    .getAll("company")
    .map((c) => c.trim())
    .filter(Boolean);

  try {
    const matches = await getMonitoredIpMatches(companies);
    return NextResponse.json({ matches: Object.fromEntries(matches) });
  } catch (err) {
    console.error("[GET /api/monitored-ips/lookup]", err);
    return NextResponse.json({ error: "Error al buscar coincidencias" }, { status: 500 });
  }
}
