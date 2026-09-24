import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { canConsultarEstatusIm } from "@/lib/permissions";
import { consultarProgresoIms, iniciarConsultaIms, IM_REGEX, MAX_IMS } from "@/lib/imEstatus";

export const dynamic = "force-dynamic";

/**
 * Arranca la consulta de estatus + últimas actividades de una lista de IMs en
 * HPSM. ADMIN estricto. Responde 202 en cuanto el scraper acepta: la corrida
 * espera su turno en la fila de HPSM y tarda ~20 s por IM.
 */
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canConsultarEstatusIm(session.role)) {
    return NextResponse.json({ error: "Solo Administrador" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const raw = (body as { ims?: unknown } | null)?.ims;
  const ims = Array.isArray(raw)
    ? [...new Set(raw.filter((s): s is string => typeof s === "string").map((s) => s.trim().toUpperCase()))].filter(
        (s) => IM_REGEX.test(s),
      )
    : [];
  if (ims.length === 0) return NextResponse.json({ error: "No hay IMs válidos en la lista" }, { status: 400 });
  if (ims.length > MAX_IMS) {
    return NextResponse.json({ error: `Máximo ${MAX_IMS} IMs por consulta` }, { status: 400 });
  }

  const r = await iniciarConsultaIms(ims);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  await db.auditLog
    .create({ data: { userId: session.id, action: "CONSULTA_ESTATUS_IM", metadata: { ims } } })
    .catch(() => {});

  return NextResponse.json({ ok: true, total: ims.length }, { status: 202 });
}

/** Progreso y resultados (parciales o finales) de la última consulta. */
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canConsultarEstatusIm(session.role)) {
    return NextResponse.json({ error: "Solo Administrador" }, { status: 403 });
  }

  const r = await consultarProgresoIms();
  if (!r.ok || !r.data) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, progreso: r.data.progreso, resultados: r.data.resultados });
}
