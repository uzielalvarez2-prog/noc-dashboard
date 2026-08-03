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
  // Puerto del servidor HTTP de envío (server.ts). Railway inyecta PORT; en local
  // cae a 8080. Es el que el dashboard llama vía WA_LISTENER_URL para mandar.
  sendServerPort: Number(process.env.PORT ?? "8080"),
  // WA_DEBUG_RECV=1 loguea CADA message_create con datos que no dependen de Store
  // (msg.from, tipo, tamaño). Sirve para distinguir "el evento no llega" de "el
  // evento llega pero getChat truena". Ruidoso en una cuenta con muchos grupos:
  // se enciende para diagnosticar y se apaga después.
  debugRecv: process.env.WA_DEBUG_RECV === "1",
};
