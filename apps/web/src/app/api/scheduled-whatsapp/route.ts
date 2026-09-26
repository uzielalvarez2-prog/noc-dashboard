import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { canAccessMonitoring } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const MAX_TEXT_LEN = 4000; // mismo límite que el envío inmediato.

// ─────────────────────────────────────────────────────────────────────────────
// Recordatorios de WhatsApp programados: mensaje de texto libre + fecha/hora +
// grupo(s) destino, redactado desde /whatsapp. El worker los envía cuando
// llega su sendAt (ver apps/worker/src/monitoring/scheduled-whatsapp.ts).
// ADMIN estricto (canAccessMonitoring).
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  // Trae pendientes y ya procesados recientes; no hace falta paginación real
  // todavía (volumen bajo, uso interno de un equipo chico).
  const items = await db.scheduledWhatsappMessage.findMany({
    orderBy: { sendAt: "asc" },
    take: 200,
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessMonitoring(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as {
      text?: string;
      notifyChatIds?: string[];
      sendAt?: string;
    };

    const text = (body.text ?? "").trim();
    const notifyChatIds = Array.isArray(body.notifyChatIds)
      ? body.notifyChatIds.filter((c) => typeof c === "string" && c.trim())
      : [];
    const sendAt = body.sendAt ? new Date(body.sendAt) : null;

    if (!text) return NextResponse.json({ error: "El mensaje está vacío" }, { status: 400 });
    if (text.length > MAX_TEXT_LEN) {
      return NextResponse.json({ error: `El mensaje excede ${MAX_TEXT_LEN} caracteres` }, { status: 400 });
    }
    if (notifyChatIds.length === 0) {
      return NextResponse.json({ error: "Elige al menos un grupo destino" }, { status: 400 });
    }
    if (!sendAt || Number.isNaN(sendAt.getTime())) {
      return NextResponse.json({ error: "Fecha/hora inválida" }, { status: 400 });
    }
    if (sendAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "La fecha/hora debe ser en el futuro" }, { status: 400 });
    }

    // Los grupos deben existir y estar habilitados — misma whitelist que el envío inmediato.
    const validGroups = await db.whatsappGroup.findMany({
      where: { chatId: { in: notifyChatIds }, enabled: true },
      select: { chatId: true },
    });
    if (validGroups.length !== notifyChatIds.length) {
      return NextResponse.json({ error: "Uno o más grupos no son válidos o están deshabilitados" }, { status: 400 });
    }

    const scheduled = await db.scheduledWhatsappMessage.create({
      data: {
        text,
        notifyChatIds,
        sendAt,
        createdBy: session.id,
        createdByName: session.name ?? "",
      },
    });

    await db.auditLog
      .create({
        data: {
          userId: session.id,
          action: "SCHEDULE_WHATSAPP",
          targetId: scheduled.id,
          metadata: { sendAt: scheduled.sendAt, chatIds: notifyChatIds, chars: text.length },
        },
      })
      .catch(() => {});

    return NextResponse.json({ item: scheduled }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/scheduled-whatsapp]", err);
    return NextResponse.json({ error: "Error al programar el mensaje" }, { status: 500 });
  }
}
