import "dotenv/config";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Variable de entorno requerida: ${name}`);
  return val;
}

export const config = {
  hpsm: {
    baseUrl: process.env.HPSM_BASE_URL ?? "https://sm.cnoc.telmexit.com",
    user: process.env.HPSM_USER ?? "",
    password: process.env.HPSM_PASSWORD ?? "",
    apiPath: process.env.HPSM_API_PATH ?? "/sm/9/rest",
    assignmentGroups: (process.env.HPSM_GROUPS ?? "PEXA").split(",").map((g) => g.trim()),
    pageSize: Number(process.env.HPSM_PAGE_SIZE ?? "500"),
  },
  // Control Center (CNOC) — fuente API de incidentes de CARE.
  // Auth Keycloak password grant + TOTP. Token dura 8h, se renueva solo.
  cc: {
    tokenUrl:
      process.env.CC_TOKEN_URL ??
      "https://authdashboard.cnoc.telmexit.com:8443/realms/ccenter/protocol/openid-connect/token",
    clientId: process.env.CC_CLIENT_ID ?? "CNOC-DASHBOARD-WEB",
    user: process.env.CC_USER ?? "",
    password: process.env.CC_PASSWORD ?? "",
    // Para full-auto: semilla base32 (secreto MFA, solo en Railway).
    totpSecret: process.env.CC_TOTP_SECRET ?? "",
    // Para pruebas manuales: código de 6 dígitos pegado a mano (efímero).
    totpCode: process.env.CC_TOTP ?? "",
    apiBase: process.env.CC_API_BASE ?? "https://controlcenter.cnoc.telmexit.com:3000",
    apikey: process.env.CC_APIKEY ?? "authorizedApplicationApikey",
    source: process.env.CC_SOURCE ?? "cc",
    // Torre que ingesta este worker (la única relevante: CARE).
    networkCode: process.env.CC_NETWORK_CODE ?? "CARE",
  },
  database: {
    url: process.env.DATABASE_URL ?? "",
  },
  poll: {
    intervalMs: Number(process.env.POLL_INTERVAL_MS ?? "10000"),
    timeoutMs: Number(process.env.HPSM_TIMEOUT_MS ?? "30000"),
  },
};