// Puente dashboard → wa-listener (Railway) para ENVIAR mensajes de WhatsApp.
// El dashboard nunca habla WhatsApp directo: reenvía la orden al proceso
// wa-listener, que es el único con la sesión viva. Mismo header x-internal-key
// que ya usan scraper y listener.

const WA_LISTENER_URL = process.env.WA_LISTENER_URL ?? "";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

export interface SendResult {
  ok: boolean;
  status: number;
  error?: string;
}

/** Reenvía un envío a wa-listener. No lanza: devuelve {ok,status,error}. */
export async function sendWhatsappViaListener(
  chatId: string,
  text: string,
): Promise<SendResult> {
  if (!WA_LISTENER_URL) {
    return { ok: false, status: 500, error: "WA_LISTENER_URL no configurada" };
  }
  if (!INTERNAL_API_KEY) {
    return { ok: false, status: 500, error: "INTERNAL_API_KEY no configurada" };
  }

  const base = WA_LISTENER_URL.replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": INTERNAL_API_KEY,
      },
      body: JSON.stringify({ chatId, text }),
      // El listener puede tardar en resolver chats; damos margen pero acotado.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error de red";
    return { ok: false, status: 502, error: `No se pudo contactar wa-listener: ${msg}` };
  }

  if (res.ok) return { ok: true, status: res.status };

  let error = `wa-listener respondió ${res.status}`;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string") error = body.error;
  } catch {
    /* respuesta sin JSON: se queda el mensaje genérico */
  }
  return { ok: false, status: res.status, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limit en memoria (por usuario). NO es defensa contra abuso distribuido —
// solo evita el doble-click / loop accidental del frontend que dispararía el
// mismo mensaje muchas veces (indistinguible de spam para WhatsApp). El volumen
// real es de pocos mensajes al día, así que no amerita Redis.
// ─────────────────────────────────────────────────────────────────────────────
const WINDOW_MS = 60_000; // ventana de 1 minuto
const MAX_PER_WINDOW = 10; // máx. 10 envíos por usuario por minuto
const hits = new Map<string, number[]>();

/** true si el usuario puede enviar ahora; registra el intento si lo permite. */
export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
  return true;
}
