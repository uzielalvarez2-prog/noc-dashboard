import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { sendWhatsappViaListener, checkRateLimit } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const MAX_TEXT_LEN = 4000; // límite sano para un mensaje de WhatsApp.

// ─────────────────────────────────────────────────────────────────────────────
// POST — enviar un mensaje a un grupo de WhatsApp desde el dashboard.
// Cualquier usuario autenticado puede usarlo. El grupo debe estar en la whitelist
// (WhatsappGroup, enabled). Se aplica rate limit por usuario y se deja bitácora
// (WhatsappSentMessage) + audit log. El envío real lo hace wa-listener.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    chatId?: unknown;
    text?: unknown;
  } | null;

  const chatId = typeof body?.chatId === "string" ? body.chatId.trim() : "";
  const text = typeof body?.text === "string" ? body.text : "";

  if (!chatId) return NextResponse.json({ error: "Selecciona un grupo" }, { status: 400 });
  if (!text.trim()) return NextResponse.json({ error: "El mensaje está vacío" }, { status: 400 });
  if (text.length > MAX_TEXT_LEN) {
    return NextResponse.json({ error: `El mensaje excede ${MAX_TEXT_LEN} caracteres` }, { status: 400 });
  }

  // Whitelist: el grupo debe existir (por chatId) y estar habilitado. Nunca
  // confiamos en el chatId que manda el cliente sin validarlo contra la base.
  const group = await db.whatsappGroup.findUnique({ where: { chatId } });
  if (!group || !group.enabled) {
    return NextResponse.json({ error: "Grupo no permitido o deshabilitado" }, { status: 403 });
  }

  if (!checkRateLimit(session.id)) {
    return NextResponse.json(
      { error: "Demasiados envíos seguidos. Espera un momento." },
      { status: 429 },
    );
  }

  const result = await sendWhatsappViaListener(chatId, text);

  // Bitácora operativa (siempre, ok o error). Guarda el nombre para legibilidad.
  await db.whatsappSentMessage
    .create({
      data: {
        groupName: group.name,
        text,
        sentBy: session.id,
        sentByName: session.name ?? "",
        ok: result.ok,
        error: result.ok ? null : result.error ?? null,
      },
    })
    .catch(() => {});

  // Audit log (regla no negociable: toda acción de usuario se audita).
  await db.auditLog
    .create({
      data: {
        userId: session.id,
        action: "SEND_WHATSAPP",
        targetId: group.name,
        metadata: { ok: result.ok, chars: text.length, chatId, error: result.error ?? null },
      },
    })
    .catch(() => {});

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "No se pudo enviar" }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
