// No se importa isResolvedStatus de "@/lib/war-room": ese módulo importa "@/lib/db"
// (pg/Prisma), y este archivo lo usa un Client Component (OpenIncidentTable) —
// arrastrar esa cadena al bundle del navegador rompe el build ("Module not found:
// net/tls", pg necesita APIs de Node). Se replica la misma regex aquí, server-free.
function isResolvedStatus(status: string | null | undefined): boolean {
  return /resolv|resuelt/i.test(status ?? "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Plantilla de WhatsApp "F.TXT" para un incidente individual (botón por fila en
// Cliente TOP). Ejemplo pedido por el usuario para IMWTPT000624:
//
// 🚨 *INCIDENTE*
// *IMWTPT000624*
// Sitio: *VPN123_CD_JUAREZ_SAN_JERONIMO*
// Ref: *6566665269*
//
// Si el estatus es RESOLVED, el encabezado cambia a "✅ *ACTIVO*".
// ─────────────────────────────────────────────────────────────────────────────

export interface IncidenteTemplateInput {
  incidentId: string;
  siteName: string;
  serviceId: string;
  status: string;
}

export function buildIncidenteTemplate(inc: IncidenteTemplateInput): string {
  const header = isResolvedStatus(inc.status) ? "✅ *ACTIVO*" : "🚨 *INCIDENTE*";
  const lines = [header, `*${inc.incidentId}*`];
  if (inc.siteName.trim()) lines.push(`Sitio: *${inc.siteName.trim()}*`);
  if (inc.serviceId.trim()) lines.push(`Ref: *${inc.serviceId.trim()}*`);
  return lines.join("\n");
}
