import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// POST — auto-descubrimiento de grupos desde wa-listener. Autenticado con
// x-internal-key (igual que edc-reports). Upsert por chatId: registra/actualiza
// el nombre visible y refresca lastSeenAt. NO cambia `enabled` (para no reactivar
// un grupo que un admin deshabilitó a propósito).
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const internalKey = process.env.INTERNAL_API_KEY;
  const isInternal = internalKey && req.headers.get("x-internal-key") === internalKey;
  if (!isInternal) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    chatId?: unknown;
    name?: unknown;
  } | null;

  const chatId = typeof body?.chatId === "string" ? body.chatId.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!chatId.endsWith("@g.us")) {
    return NextResponse.json({ error: "chatId de grupo inválido" }, { status: 400 });
  }

  await db.whatsappGroup.upsert({
    where: { chatId },
    create: { chatId, name, createdBy: "" },
    update: { name, lastSeenAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
