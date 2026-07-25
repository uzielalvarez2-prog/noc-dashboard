import { config } from "./config.js";

export interface EdcReportPayload {
  incidentId: string;
  rawText: string;
  sentAt: string; // ISO
}

/**
 * Envía un reporte al dashboard. Mismo patrón que el scraper HPSM:
 * POST con header `x-internal-key`. El API hace upsert por incidentId.
 */
export async function postReport(payload: EdcReportPayload): Promise<void> {
  const url = `${config.dashboardUrl}/api/edc-reports`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": config.internalApiKey,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /api/edc-reports falló [${res.status}]: ${text.slice(0, 300)}`);
  }
}

/**
 * Registra en el dashboard un grupo detectado (auto-descubrimiento). El dashboard
 * hace upsert por chatId. Mismo patrón interno (x-internal-key). Lanza si falla,
 * para que el caller decida si reintentar (no lo cachea si no se guardó).
 */
export async function postDiscoveredGroup(chatId: string, name: string): Promise<void> {
  const url = `${config.dashboardUrl}/api/whatsapp/groups/discovered`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": config.internalApiKey,
    },
    body: JSON.stringify({ chatId, name }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /api/whatsapp/groups/discovered falló [${res.status}]: ${text.slice(0, 200)}`);
  }
}
