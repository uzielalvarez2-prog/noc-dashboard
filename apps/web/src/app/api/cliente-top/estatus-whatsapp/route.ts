import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canConsultarEstatusIm } from "@/lib/permissions";
import { dispararEstatusClienteTop } from "@/lib/cliente-top-run";

// ─────────────────────────────────────────────────────────────────────────────
// ESTATUS CLIENTE TOP → WhatsApp (grupo "Supervision PEXA"). PASO 1 (DISPARAR).
//
// Lee los IMs abiertos del cliente TOP (rápido) y se los manda al scraper, que
// consulta HPSM y al terminar hace callback a /api/cliente-top/enviar para armar
// y mandar el mensaje. Este handler responde de inmediato ("ya arrancó") — NO
// espera la consulta: por eso NO necesita maxDuration largo (el intento anterior
// con esa espera chocaba con el timeout de Vercel/navegador).
//
// Autorización (dos vías):
//   - Cron del scraper: header x-internal-key === INTERNAL_API_KEY.
//   - ADMIN en el dashboard (botón de prueba manual): sesión con rol ADMIN.
//
// Configuración (env vars):
//   - CLIENTE_TOP_CHAT_ID   grupo destino por defecto (xxxx@g.us). El body puede
//                           mandar otro chatId para pruebas.
//   - CLIENTE_TOP_PREFIJO   nombre del cliente a recortar del Site Name (ej.
//                           "SMART FIT"). Default "SMART FIT".
//   - CLIENTE_TOP_ETIQUETA  etiqueta del encabezado. Default "PEXA".
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const internalKey = process.env.INTERNAL_API_KEY;
  const isInternal = !!internalKey && req.headers.get("x-internal-key") === internalKey;

  if (!isInternal) {
    const session = getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canConsultarEstatusIm(session.role))
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  let body: { chatId?: unknown; enviarSiVacio?: unknown; clienteTopId?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* body opcional */
  }

  const clienteTopId = typeof body.clienteTopId === "string" ? body.clienteTopId.trim() : undefined;
  const chatId = typeof body.chatId === "string" ? body.chatId.trim() : undefined;

  // Modo MANUAL (un cliente) exige grupo destino. Modo CRON (sin clienteTopId)
  // no manda chatId: cada cliente marcado tiene su propio grupo en DB.
  if (clienteTopId && !chatId) {
    return NextResponse.json(
      { error: "Falta el grupo destino para el envío manual (chatId)." },
      { status: 400 }
    );
  }

  // Default: no mandar nada si no hay IMs abiertos (evita ruido cada corrida).
  // El cron y el botón pueden forzar el envío con enviarSiVacio.
  const enviarSiVacio = body.enviarSiVacio === true;

  try {
    const result = await dispararEstatusClienteTop({
      clienteTopId,
      chatId,
      enviarSiVacio,
    });
    const status = result.ok ? 202 : 502;
    return NextResponse.json(result, { status });
  } catch (err) {
    console.error("[POST /api/cliente-top/estatus-whatsapp]", err);
    return NextResponse.json({ error: "Error disparando la corrida" }, { status: 500 });
  }
}
