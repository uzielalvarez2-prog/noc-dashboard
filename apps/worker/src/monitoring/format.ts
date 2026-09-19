export interface AlertData {
  siglasIm: string;
  incidentId: string;
  serviceRef: string;
  company: string;
  siteName: string;
  /** Teléfono del asignado, sólo dígitos. Vacío/ausente = alerta sin mención. */
  assigneePhone?: string;
}

// Grupo del cliente TIENDAS 3B: recibe un template propio (sin @mención, sin
// "Company", con "Sitio" y la leyenda de cierre) que NO debe tocar el template
// genérico que usan el resto de los grupos.
export const CHAT_ID_TIENDAS_3B = "120363418861405181@g.us";

/** Arma el texto exacto del template de "servicio activo" para WhatsApp. */
export function buildAlertMessage(data: AlertData, chatId?: string): string {
  const header = data.siglasIm || data.incidentId;

  if (chatId === CHAT_ID_TIENDAS_3B) {
    return [
      "✅ *ACTIVO*",
      `Incidente: ${header}`,
      `Sitio: ${data.siteName}`,
      `Referencia: ${data.serviceRef}`,
      "De su apoyo para validar, gracias",
    ].join("\n");
  }

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
