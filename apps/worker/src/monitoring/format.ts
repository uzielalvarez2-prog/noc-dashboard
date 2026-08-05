export interface AlertData {
  siglasIm: string;
  incidentId: string;
  serviceRef: string;
  company: string;
}

/** Arma el texto exacto del template de "servicio activo" para WhatsApp. */
export function buildAlertMessage(data: AlertData): string {
  const header = data.siglasIm || data.incidentId;
  // Los asteriscos son el marcado de negrita de WhatsApp, no decoración.
  return [
    "✅ *ACTIVO*",
    header,
    `REF: ${data.serviceRef}`,
    `Company: ${data.company}`,
  ].join("\n");
}
