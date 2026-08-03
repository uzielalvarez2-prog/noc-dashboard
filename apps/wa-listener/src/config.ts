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
  // chatId del grupo objetivo (xxxx@g.us). Es la forma PREFERIDA de identificarlo:
  // el chatId viaja en el propio mensaje, mientras que el nombre obliga a llamar
  // msg.getChat() — API de Store que se rompe sola cuando WhatsApp Web se adelanta
  // al pin de webVersionCache, y con ella la recepción entera. Si queda vacío se
  // cae al nombre (útil en local, donde no siempre se conoce el chatId).
  groupChatId: (process.env.WA_GROUP_CHAT_ID ?? "").trim(),
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
