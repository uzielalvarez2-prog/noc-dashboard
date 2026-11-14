import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * Manda una alerta de texto por WhatsApp al grupo de alertas del scraper.
 *
 * Va directo al wa-listener (POST /send con x-internal-key), sin pasar por el
 * dashboard: una alerta de "el scraper no pudo subir datos" debe llegar aunque
 * el dashboard sea justo lo que está caído.
 *
 * NUNCA lanza ni deja colgada la corrida: devuelve false si no se pudo enviar
 * (variables sin configurar, listener caído, chat inexistente) y deja el motivo
 * en el log, porque una alerta fallida no debe tapar el error que la originó.
 */
export async function sendWhatsappAlert(text: string): Promise<boolean> {
  const { listenerUrl, chatId } = config.alert;
  if (!listenerUrl || !chatId) {
    logger.warn(
      "Alerta WhatsApp NO enviada: faltan WA_LISTENER_URL y/o SCRAPER_ALERT_CHAT_ID en el scraper",
      { alerta: text.split("\n")[0] },
    );
    return false;
  }
  try {
    const res = await fetch(`${listenerUrl.replace(/\/+$/, "")}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": config.internalApiKey },
      body: JSON.stringify({ chatId, text }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      logger.error(`Alerta WhatsApp rechazada por wa-listener [${res.status}]: ${body}`);
      return false;
    }
    logger.info("Alerta WhatsApp enviada");
    return true;
  } catch (err) {
    logger.error("Alerta WhatsApp: no se pudo contactar a wa-listener", { err: String(err) });
    return false;
  }
}
