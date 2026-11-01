import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { canCerrarIncidentes } from "@/lib/permissions";
import {
  iniciarCierre,
  consultarProgresoCierre,
  IM_REGEX,
  MAX_CERRAR,
  type ItemCierre,
  type ModoCierre,
} from "@/lib/cerrarIncidentes";

export const dynamic = "force-dynamic";

/**
 * Arranca el cierre (o verificación/aplicación, según `modo`) de una lista de
 * incidentes en HPSM aplicando templates. ADMIN estricto. Responde 202 en
 * cuanto el scraper acepta: la corrida espera su turno en la fila de HPSM y
 * tarda ~30 s por IM.
 */
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canCerrarIncidentes(session.role)) {
    return NextResponse.json({ error: "Solo Administrador" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const b = (body as { items?: unknown; modo?: unknown } | null) ?? {};
  const modoRaw = typeof b.modo === "string" ? b.modo : "verificar";
  const modo: ModoCierre =
    modoRaw === "cerrar" || modoRaw === "aplicar" ? (modoRaw as ModoCierre) : "verificar";

  // items: [{ im, template }], dedup por IM (el último gana).
  const porIm = new Map<string, ItemCierre>();
  if (Array.isArray(b.items)) {
    for (const it of b.items) {
      const o = (it ?? {}) as { im?: unknown; template?: unknown };
      const im = typeof o.im === "string" ? o.im.trim().toUpperCase() : "";
      const template = typeof o.template === "string" ? o.template.trim() : "";
      if (IM_REGEX.test(im) && template) porIm.set(im, { im, template });
    }
  }
  const items = [...porIm.values()];
  if (items.length === 0) {
    return NextResponse.json(
      { error: "No hay IMs válidos con template en la lista" },
      { status: 400 },
    );
  }
  if (items.length > MAX_CERRAR) {
    return NextResponse.json({ error: `Máximo ${MAX_CERRAR} IMs por corrida` }, { status: 400 });
  }

  const r = await iniciarCierre(items, modo);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  // Audit log: quién, qué IMs/templates, qué modo. Cerrar es irreversible.
  await db.auditLog
    .create({
      data: {
        userId: session.id,
        action: "CERRAR_INCIDENTES",
        metadata: { modo, items: items.map((it) => ({ im: it.im, template: it.template })) },
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true, total: items.length, modo }, { status: 202 });
}

/** Progreso y resultados (parciales o finales) de la última corrida de cierre. */
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canCerrarIncidentes(session.role)) {
    return NextResponse.json({ error: "Solo Administrador" }, { status: 403 });
  }

  const r = await consultarProgresoCierre();
  if (!r.ok || !r.data) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, progreso: r.data.progreso, resultados: r.data.resultados });
}
