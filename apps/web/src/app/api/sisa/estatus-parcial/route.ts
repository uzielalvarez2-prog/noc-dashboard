import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseFechaManto, type MantoEstatusResult } from "@/lib/manto";

export const dynamic = "force-dynamic";

/**
 * Recibe UN resultado de Manto desde el scraper y lo guarda. El scraper llama
 * a esta ruta por cada folio que consulta (~18 s cada uno), de modo que la
 * tabla del dashboard se va poblando durante la corrida en vez de esperar
 * ~13 min a que termine.
 *
 * Solo para el scraper: se autentica con x-internal-key (no hay sesión de
 * usuario), igual que /api/sisa/upload.
 */
export async function POST(req: NextRequest) {
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey || req.headers.get("x-internal-key") !== internalKey) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { result?: MantoEstatusResult };
    const r = body.result;
    if (!r || typeof r.folio !== "string" || !/^\d{1,15}$/.test(r.folio)) {
      return NextResponse.json({ error: "result.folio inválido" }, { status: 400 });
    }

    // El folio (vendorTicket) puede repetirse en varios incidentes: el
    // resultado aplica a todos los que lo comparten.
    const checkedAt = new Date();
    const data = r.found
      ? {
          estadoEms: r.estadoEms ?? null,
          estadoEfa: r.estadoEfa ?? null,
          fechaEstadoEfa: parseFechaManto(r.fechaEstadoEfa),
          estatusError: null,
          estatusCheckedAt: checkedAt,
        }
      : {
          // Folio purgado de Manto: se registra el motivo pero NO se borra el
          // último estado conocido.
          estatusError: r.error ?? "No encontrado en Manto",
          estatusCheckedAt: checkedAt,
        };

    const res = await db.sisaTicket.updateMany({ where: { vendorTicket: r.folio }, data });

    return NextResponse.json({ ok: true, folio: r.folio, actualizados: res.count });
  } catch (err) {
    console.error("[POST /api/sisa/estatus-parcial]", err);
    return NextResponse.json({ error: "Error guardando estatus" }, { status: 500 });
  }
}
