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
