// Roles y permisos del dashboard NOC.
//
//  IDS        — Ingeniero de Diagnóstico y Solución: ve y descarga todo el
//               dashboard e importa CSV de HPSM. NO ve Configuración.
//  SUPERVISOR — todo lo de IDS + Configuración (alta de usuarios y reglas de alerta).
//  ADMIN      — acceso total. Rol protegido: siempre debe existir al menos uno.
export type Role = "IDS" | "SUPERVISOR" | "ADMIN";

export const ROLES: Role[] = ["IDS", "SUPERVISOR", "ADMIN"];

export const ROLE_LABELS: Record<Role, string> = {
  IDS: "IDS",
  SUPERVISOR: "Supervisor",
  ADMIN: "Administrador",
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

export function isValidRole(role: string): role is Role {
  return (ROLES as string[]).includes(role);
}
