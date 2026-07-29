export interface AlertData {
  siglasIm: string;
  incidentId: string;
  serviceRef: string;
  company: string;
  latencyMs: number | null;
}

/** Arma el texto exacto del template de "servicio activo" para WhatsApp. */
export function buildAlertMessage(data: AlertData): string {
  const header = data.siglasIm || data.incidentId;
  const latencia = data.latencyMs != null ? `${data.latencyMs} ms` : "N/D";
  return [
    header,
    `REF: ${data.serviceRef}`,
    `Company: ${data.company}`,
    "ACTIVO",
    `Latencia: ${latencia}`,
  ].join("\n");
}
