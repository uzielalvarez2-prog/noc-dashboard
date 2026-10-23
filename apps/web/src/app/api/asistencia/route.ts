import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canAccessAsistencia } from "@/lib/permissions";
import {
  getColaboradores,
  getEventosMes,
  construirResumen,
  cobexturaPorDia,
} from "@/lib/asistencia";

export const dynamic = "force-dynamic";

// GET /api/asistencia?year=2026&month=10
// Devuelve el padrón con horarios, los eventos del mes, el resumen y la cobertura.
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessAsistencia(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const now = new Date();
  const year = Number(req.nextUrl.searchParams.get("year")) || now.getUTCFullYear();
  const month = Number(req.nextUrl.searchParams.get("month")) || now.getUTCMonth() + 1;
  if (month < 1 || month > 12) {
    return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
  }

  const [colaboradores, eventos] = await Promise.all([
    getColaboradores(),
    getEventosMes(year, month),
  ]);
  const resumen = construirResumen(colaboradores, eventos, year, month);
  const cobertura = cobexturaPorDia(colaboradores, eventos, year, month);

  return NextResponse.json({ year, month, colaboradores, eventos, resumen, cobertura });
}
