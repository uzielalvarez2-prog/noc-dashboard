import { config } from "../config.js";

// Réplica mínima de apps/web/src/lib/whatsapp.ts::sendWhatsappViaListener — el
// worker es un proceso Node separado y no puede importar directo de apps/web.

export interface SendResult {
  ok: boolean;
  error?: string;
}

/** Reenvía un envío a wa-listener. No lanza: devuelve {ok, error}. */
export async function sendWhatsappViaListener(
  chatId: string,
  text: string,
  mentions: string[] = [],
): Promise<SendResult> {
  const { listenerUrl, internalApiKey } = config.whatsapp;
  if (!listenerUrl) return { ok: false, error: "WA_LISTENER_URL no configurada" };
  if (!internalApiKey) return { ok: false, error: "INTERNAL_API_KEY no configurada" };

  const base = listenerUrl.replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": internalApiKey },
      body: JSON.stringify({ chatId, text, mentions }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error de red";
    return { ok: false, error: `No se pudo contactar wa-listener: ${msg}` };
  }

  if (res.ok) return { ok: true };

  let error = `wa-listener respondió ${res.status}`;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string") error = body.error;
  } catch {
    /* respuesta sin JSON */
  }
  return { ok: false, error };
}
