import { db } from "../sync/incidents.js";
import { logger } from "../logger.js";

// Email pospuesto — se activa cuando se configure RESEND_API_KEY
export async function evaluateAlerts(): Promise<void> {
  if (!process.env.RESEND_API_KEY) return; // Sin API key, omitir silenciosamente

  const rules = await db.alertRule.findMany({ where: { isActive: true } });
  if (rules.length === 0) return;

  logger.debug(`Evaluando ${rules.length} reglas de alerta`);
  // TODO: implementar envío cuando se configure Resend
}
