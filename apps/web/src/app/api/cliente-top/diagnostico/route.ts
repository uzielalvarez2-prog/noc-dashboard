import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canConsultarEstatusIm } from "@/lib/permissions";
import { diagnosticarClienteTop } from "@/lib/cliente-top-run";

// DIAGNÓSTICO TEMPORAL: sin enviar nada, devuelve qué cliente se resolvió y
// cuántos/ cuáles IMs matchean. Para depurar el conteo. Solo ADMIN.
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canConsultarEstatusIm(session.role))
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  let body: { clienteTopId?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* opcional */
  }
  const clienteTopId = typeof body.clienteTopId === "string" ? body.clienteTopId.trim() : undefined;

  const diag = await diagnosticarClienteTop(clienteTopId);
  return NextResponse.json(diag);
}
