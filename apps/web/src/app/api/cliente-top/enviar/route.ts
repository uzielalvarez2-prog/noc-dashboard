import { NextRequest, NextResponse } from "next/server";
import { enviarMensajeClienteTop } from "@/lib/cliente-top-run";
import type { ClienteTopItem } from "@/lib/cliente-top-estatus";
import type { ImEstatusResult } from "@/lib/imEstatus";

// ─────────────────────────────────────────────────────────────────────────────
// ESTATUS CLIENTE TOP → WhatsApp. PASO 3 (ENVIAR) — callback del scraper.
//
// Lo llama SOLO el scraper (x-internal-key) cuando terminó de consultar HPSM:
// recibe los items del cliente + los resultados crudos, arma el mensaje y lo
// manda al grupo. Rápido: sin consultas lentas, sin riesgo de timeout.
// ─────────────────────────────────────────────────────────────────────────────

function parseItems(raw: unknown): ClienteTopItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ClienteTopItem[] = [];
  for (const it of raw) {
    const o = (it ?? {}) as { incidentId?: unknown; ref?: unknown; siteName?: unknown; status?: unknown };
    if (typeof o.incidentId !== "string") continue;
    out.push({
      incidentId: o.incidentId,
      ref: typeof o.ref === "string" ? o.ref : "",
      siteName: typeof o.siteName === "string" ? o.siteName : "",
      status: typeof o.status === "string" ? o.status : "",
    });
  }
  return out;
}

function parseResultados(raw: unknown): ImEstatusResult[] {
  if (!Array.isArray(raw)) return [];
  // Confiamos en la forma que produce el scraper (lib/hpsm-incident). Solo
  // validamos que cada entrada tenga `im` para poder mapearla.
  return raw.filter(
    (r): r is ImEstatusResult => !!r && typeof (r as { im?: unknown }).im === "string",
  );
}

export async function POST(req: NextRequest) {
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey || req.headers.get("x-internal-key") !== internalKey) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: {
    chatId?: unknown;
    prefijo?: unknown;
    etiqueta?: unknown;
    items?: unknown;
    resultados?: unknown;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const chatId = typeof body.chatId === "string" ? body.chatId.trim() : "";
  if (!chatId) return NextResponse.json({ error: "chatId requerido" }, { status: 400 });

  try {
    const result = await enviarMensajeClienteTop({
      chatId,
      prefijo: typeof body.prefijo === "string" ? body.prefijo : "",
      etiqueta: typeof body.etiqueta === "string" ? body.etiqueta : "PEXA",
      items: parseItems(body.items),
      resultados: parseResultados(body.resultados),
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (err) {
    console.error("[POST /api/cliente-top/enviar]", err);
    return NextResponse.json({ error: "Error enviando el mensaje" }, { status: 500 });
  }
}
