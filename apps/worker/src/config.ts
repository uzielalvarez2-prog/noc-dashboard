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
  redis: {
    url: process.env.REDIS_URL ?? "",
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY ?? "",
    fromEmail: process.env.RESEND_FROM ?? "noc@telmexit.com",
  },
  poll: {
    intervalMs: Number(process.env.POLL_INTERVAL_MS ?? "10000"),
    timeoutMs: Number(process.env.HPSM_TIMEOUT_MS ?? "30000"),
  },
};