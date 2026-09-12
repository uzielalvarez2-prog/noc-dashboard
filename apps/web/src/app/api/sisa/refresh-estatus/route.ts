import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
import {
  iniciarConsultaEstatusSisa,
  consultarProgresoSisa,
  PORTAL_FUERA_DE_GESTION_MSG,
} from "@/lib/manto";

export const dynamic = "force-dynamic";

// Solo se consultan folios cuyo IM esté en uno de estos estatus: son los que
// están realmente en seguimiento con el proveedor. Un RESOLVED ya no necesita
// que se le pregunte a Manto, y cada consulta cuesta ~18 s (el servidor de
// Manto es lento), así que filtrar aquí es lo que hace viable la corrida:
// de ~97 folios abiertos se baja a ~45.
const ESTATUS_EN_SEGUIMIENTO = ["PENDING VENDOR", "WORK IN PROGRESS", "PENDING OTHER"];

/**
 * Arranca la actualización de estatus SISA contra el portal Manto.
 * BAJO DEMANDA: lo dispara el botón "Estatus Manto" de la vista SISA, no hay cron.
 *
 * Responde de inmediato (202): la corrida tarda ~18 s por folio (~13 min con
 * 45 folios), así que corre en segundo plano en el scraper, que va guardando
 * cada resultado vía /api/sisa/estatus-parcial. La tabla se puebla sola con el
 * refetch del cliente.
 */
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const tickets = await db.sisaTicket.findMany({
      select: { incidentId: true, vendorTicket: true },
    });
    if (tickets.length === 0) {
      return NextResponse.json({ ok: true, iniciado: false, total: 0, message: "No hay tickets SISA cargados." });
    }

    // Cruce con abiertos, filtrando por estatus en seguimiento. El status se
    // compara normalizado (mayúsculas/espacios) porque viene del export de HPSM.
    const open = await db.openIncident.findMany({
      where: { incidentId: { in: tickets.map((t) => t.incidentId) } },
      select: { incidentId: true, status: true },
    });
    const enSeguimiento = new Set(
      open
        .filter((o) => ESTATUS_EN_SEGUIMIENTO.includes((o.status ?? "").trim().toUpperCase()))
        .map((o) => o.incidentId),
    );

    // Un mismo folio SISA puede repetirse en varios incidentes: se consulta una
    // vez y el scraper aplica el resultado a todos los que lo comparten.
    const folios = [
      ...new Set(
        tickets
          .filter((t) => enSeguimiento.has(t.incidentId))
          .map((t) => t.vendorTicket.trim())
          .filter((f) => /^\d{1,15}$/.test(f)), // Manto exige folio numérico
      ),
    ];

    if (folios.length === 0) {
      return NextResponse.json({
        ok: true,
        iniciado: false,
        total: 0,
        message: `No hay folios SISA por consultar (solo se revisan IM en ${ESTATUS_EN_SEGUIMIENTO.join(", ")}).`,
      });
    }

    const inicio = await iniciarConsultaEstatusSisa(folios);
    if (!inicio.ok) {
      if (inicio.portalFueraDeGestion) {
        return NextResponse.json(
          { error: PORTAL_FUERA_DE_GESTION_MSG, portalFueraDeGestion: true },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: inicio.error ?? "No se pudo iniciar la consulta a Manto", progreso: inicio.progreso },
        { status: inicio.status },
      );
    }

    await db.auditLog
      .create({
        data: {
          userId: session.id,
          action: "REFRESH_SISA_ESTATUS",
          metadata: { folios: folios.length, estatusFiltrados: ESTATUS_EN_SEGUIMIENTO },
        },
      })
      .catch(() => {});

    return NextResponse.json(
      {
        ok: true,
        iniciado: true,
        total: inicio.total ?? folios.length,
        message: `Consulta iniciada para ${folios.length} folios. La tabla se irá actualizando (~18 s por folio).`,
      },
      { status: 202 },
    );
  } catch (err) {
    console.error("[POST /api/sisa/refresh-estatus]", err);
    return NextResponse.json({ error: "Error iniciando la consulta de estatus SISA" }, { status: 500 });
  }
}

/** Progreso de la corrida en curso (o de la última), para que la UI lo muestre. */
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const r = await consultarProgresoSisa();
  if (!r.ok) {
    return NextResponse.json({ error: r.error ?? "No se pudo leer el progreso" }, { status: r.status });
  }
  return NextResponse.json({ ok: true, progreso: r.progreso });
}
