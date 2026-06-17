import "dotenv/config";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Variable de entorno requerida: ${name}`);
  return val;
}

export const config = {
  hpsm: {
    url: process.env.HPSM_URL ?? "https://sm.cnoc.telmexit.com/sm/index.do?lang=en",
    user: requireEnv("HPSM_USER"),
    password: requireEnv("HPSM_PASSWORD"),
  },
  downloadDir: process.env.DOWNLOAD_DIR ?? "C:\\Users\\Admin\\noc-csvs",
  closed: {
    group: process.env.HPSM_CLOSED_GROUP ?? "PEXA",
    startTime: process.env.HPSM_CLOSED_START_TIME ?? "07:00",
    endTime: process.env.HPSM_CLOSED_END_TIME ?? "22:10",
  },
  headed: process.env.HEADED === "true",
  dashboardUrl: process.env.DASHBOARD_URL ?? "http://localhost:3000",
  internalApiKey: requireEnv("INTERNAL_API_KEY"),
};
