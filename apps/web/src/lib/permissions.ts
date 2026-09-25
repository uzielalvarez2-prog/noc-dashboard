// Roles y permisos del dashboard NOC.
//
//  IDS        — Ingeniero de Diagnóstico y Solución: ve y descarga todo el
//               dashboard e importa CSV de HPSM. NO ve Configuración.
//  SUPERVISOR — todo lo de IDS + Configuración (alta de usuarios y reglas de alerta).
//  ADMIN      — acceso total. Rol protegido: siempre debe existir al menos uno.
//  CASE       — personal del CASE San Juan: SOLO ve /case-san-juan y agrega
//               notas "Estatus CASE". El proxy lo encierra en esa página.
export type Role = "IDS" | "SUPERVISOR" | "ADMIN" | "CASE";

export const ROLES: Role[] = ["IDS", "SUPERVISOR", "ADMIN", "CASE"];

export const ROLE_LABELS: Record<Role, string> = {
  IDS: "IDS",
  SUPERVISOR: "Supervisor",
  ADMIN: "Administrador",
  CASE: "CASE San Juan",
};

/** Acceso a Configuración (botón, página /settings, gestión de usuarios y alertas). */
export function canAccessSettings(role: string | undefined): boolean {
  return role === "ADMIN" || role === "SUPERVISOR";
}

/** Importar CSV de HPSM manualmente — todos los roles autenticados. */
export function canImportCsv(role: string | undefined): boolean {
  return role === "ADMIN" || role === "SUPERVISOR" || role === "IDS";
}

/**
 * Administración del monitoreo de IP — ADMIN estricto (no Supervisor).
 * Cubre la página /monitoreo-ip (catálogo completo), su enlace en el menú y el
 * BORRADO de IPs. Ver canCaptureMonitoredIp para el permiso más acotado.
 */
export function canAccessMonitoring(role: string | undefined): boolean {
  return role === "ADMIN";
}

/**
 * Capturar/corregir la IP de un incidente y activar o desactivar su monitoreo,
 * desde la columna "IP / Monitoreo" de EDC → Total EDC. Abierto a todos los roles
 * autenticados: cuando un enlace se cae, quien esté de turno debe poder cargar la
 * IP y ponerla a monitorear sin esperar al ADMIN. NO incluye borrar IPs ni ver el
 * catálogo — eso sigue en canAccessMonitoring.
 */
export function canCaptureMonitoredIp(role: string | undefined): boolean {
  return role === "ADMIN" || role === "SUPERVISOR" || role === "IDS";
}

/**
 * Catálogo de contactos de agentes (nombre HPSM → número de WhatsApp), usado para
 * @mencionar al asignado en la alerta de servicio activo. ADMIN estricto: son
 * números personales del equipo.
 */
export function canManageAgentContacts(role: string | undefined): boolean {
  return role === "ADMIN";
}

/**
 * Consulta de estatus + bitácora de una lista de IMs directo en HPSM (página
 * /estatus-im). ADMIN estricto: cada consulta ocupa el login único del scraper.
 */
export function canConsultarEstatusIm(role: string | undefined): boolean {
  return role === "ADMIN";
}

/**
 * Vista /case-san-juan (incidentes SISA del CASE SAN JUAN + bitácora "Estatus CASE").
 * EN PRUEBAS: solo ADMIN (y el rol CASE, que aún no tiene usuarios). Al aprobarse
 * se abre a IDS y SUPERVISOR en solo lectura.
 */
export function canVerCaseSanJuan(role: string | undefined): boolean {
  return role === "ADMIN" || role === "CASE";
}

/** Agregar notas a la bitácora "Estatus CASE". Los demás roles solo leen y copian. */
export function canEditarEstatusCase(role: string | undefined): boolean {
  return role === "ADMIN" || role === "CASE";
}

/** Rol encerrado en /case-san-juan: el proxy le bloquea cualquier otra ruta. */
export function isRolCase(role: string | undefined): boolean {
  return role === "CASE";
}

export function isValidRole(role: string): role is Role {
  return (ROLES as string[]).includes(role);
}
