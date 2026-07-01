import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { getActiveEdcReports } from "@/lib/queries/edcReports";

// IM + 2+ letras + dígitos (ej. IMPNOE000070). Misma regex que usa el listener.
const IM_RE = /^IM[A-Z]{2,}\d+$/;

// ─────────────────────────────────────────────────────────────────────────────
// POST — ingest desde apps/wa-listener.
// Autenticado con `x-internal-key` (igual que el upload del scraper). Guarda el
// bloque de texto completo tal cual del grupo de WhatsApp. Upsert por incidentId:
// 1 reporte vigente por IM, el último mensaje gana. No se parsea campo por campo.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const internalKey = process.env.INTERNAL_API_KEY;
  const isInternal = internalKey && req.headers.get("x-internal-key") === internalKey;
  if (!isInternal) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = (await req.json()) as {
      incidentId?: unknown;
      rawText?: unknown;
      sentAt?: unknown;
    };

    const incidentId =
      typeof body.incidentId === "string" ? body.incidentId.trim().toUpperCase() : "";
    const rawText = typeof body.rawText === "string" ? body.rawText : "";

    if (!IM_RE.test(incidentId)) {
      return NextResponse.json(
        { error: "incidentId inválido (se espera IMxxxxxxx)" },
        { status: 400 }
      );
    }
    // Los incidentes CARE (IMCARE...) no son de PEXA — no se guardan.
    if (incidentId.startsWith("IMCARE")) {
      return NextResponse.json({ ok: true, skipped: "care", incidentId });
    }
    if (!rawText.trim()) {
      return NextResponse.json({ error: "rawText vacío" }, { status: 400 });
    }

    const sentAt =
      typeof body.sentAt === "string" || typeof body.sentAt === "number"
        ? new Date(body.sentAt)
        : new Date();
    if (Number.isNaN(sentAt.getTime())) {
      return NextResponse.json({ error: "sentAt inválido" }, { status: 400 });
    }

    // "Gana el más reciente": solo sobrescribe si el mensaje entrante es igual o
    // más nuevo que el guardado. Así un mensaje viejo del backfill no pisa una
    // actualización más reciente (bug que dejaba el estatus desactualizado).
    const updated = await db.edcReport.updateMany({
      where: { incidentId, sentAt: { lte: sentAt } },
      data: { rawText, sentAt },
    });
    if (updated.count === 0) {
      // No existía, o el guardado es más nuevo: crear si falta, si no dejar el nuevo.
      await db.edcReport.upsert({
        where: { incidentId },
        create: { incidentId, rawText, sentAt },
        update: {},
      });
    }

    return NextResponse.json({ ok: true, incidentId });
  } catch (err) {
    console.error("[POST /api/edc-reports]", err);
    return NextResponse.json({ error: "Error procesando el reporte" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — lectura para el dashboard (pestaña EDC → "Reportes WhatsApp").
// Requiere sesión. Solo devuelve reportes cuyo IM sigue en abiertos.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const reports = await getActiveEdcReports();
    return NextResponse.json({ reports });
  } catch (err) {
    console.error("[GET /api/edc-reports]", err);
    return NextResponse.json({ error: "Error obteniendo reportes" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — quitar manualmente una tarjeta desde el dashboard (?incidentId=IMxxx).
// Requiere sesión. Borra el reporte; si el grupo vuelve a mandar un mensaje de
// ese IM el listener lo re-inserta (upsert), así que puede reaparecer con nueva
// info — comportamiento esperado.
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const incidentId = (req.nextUrl.searchParams.get("incidentId") ?? "").trim().toUpperCase();
  if (!IM_RE.test(incidentId)) {
    return NextResponse.json({ error: "incidentId inválido (se espera IMxxxxxxx)" }, { status: 400 });
  }

  try {
    await db.edcReport.deleteMany({ where: { incidentId } });
    return NextResponse.json({ ok: true, incidentId });
  } catch (err) {
    console.error("[DELETE /api/edc-reports]", err);
    return NextResponse.json({ error: "Error eliminando el reporte" }, { status: 500 });
  }
}
