export interface AlertData {
  siglasIm: string;
  incidentId: string;
  serviceRef: string;
  company: string;
  /** Teléfono del asignado, sólo dígitos. Vacío/ausente = alerta sin mención. */
  assigneePhone?: string;
}

/** Arma el texto exacto del template de "servicio activo" para WhatsApp. */
export function buildAlertMessage(data: AlertData): string {
  const header = data.siglasIm || data.incidentId;
  // Los asteriscos son el marcado de negrita de WhatsApp, no decoración.
  const lines = [
    "✅ *ACTIVO*",
    header,
    `REF: ${data.serviceRef}`,
    `Company: ${data.company}`,
  ];

  // WhatsApp sólo pinta la mención si el texto trae "@<dígitos>" coincidiendo con
  // el JID que va en `mentions`; el nombre visible lo resuelve el cliente receptor.
  if (data.assigneePhone) lines.push("", `@${data.assigneePhone}`);

  return lines.join("\n");
}

/** JID de WhatsApp para mencionar, a partir de un teléfono en dígitos. */
export function phoneToJid(phone: string): string {
  return `${phone}@c.us`;
}
