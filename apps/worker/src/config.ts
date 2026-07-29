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
  database: {
    url: process.env.DATABASE_URL ?? "",
  },
  poll: {
    intervalMs: Number(process.env.POLL_INTERVAL_MS ?? "60000"),
    timeoutMs: Number(process.env.HPSM_TIMEOUT_MS ?? "30000"),
  },
  schedule: {
    // Zona horaria para evaluar la ventana de pausa (Railway corre en UTC).
    timezone: process.env.WORKER_TIMEZONE ?? "America/Mexico_City",
    // Ventana de pausa nocturna: el worker no sincroniza para que Neon duerma.
    pauseStart: process.env.WORKER_PAUSE_START ?? "23:30",
    pauseEnd: process.env.WORKER_PAUSE_END ?? "05:55",
  },
  whatsapp: {
    listenerUrl: process.env.WA_LISTENER_URL ?? "",
    internalApiKey: process.env.INTERNAL_API_KEY ?? "",
  },
  monitoring: {
    // Ciclo de monitoreo de IP: independiente de isPaused(), corre también de noche.
    intervalMs: Number(process.env.IP_MONITOR_INTERVAL_MS ?? "30000"),
    pingTimeoutMs: Number(process.env.IP_MONITOR_PING_TIMEOUT_MS ?? "2000"),
    tcpFallbackPort: Number(process.env.IP_MONITOR_TCP_PORT ?? "443"),
    // Ventana de "arriba sostenido" antes de alertar UP (ver IpMonitor.upSince).
    sustainedUpMs: Number(process.env.IP_MONITOR_SUSTAINED_UP_MS ?? "60000"),
  },
};