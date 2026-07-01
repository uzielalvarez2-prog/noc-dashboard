import "dotenv/config";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Variable de entorno requerida: ${name}`);
  return val;
}

export const config = {
  dashboardUrl: process.env.DASHBOARD_URL ?? "http://localhost:3000",
  internalApiKey: requireEnv("INTERNAL_API_KEY"),
  groupName: process.env.WA_GROUP_NAME ?? "STAFF SUPERVISIÓN",
  backfillLimit: Number(process.env.WA_BACKFILL_LIMIT ?? "50"),
};
