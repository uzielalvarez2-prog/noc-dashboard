import { existsSync } from "node:fs";
import pkg from "whatsapp-web.js";
import { logger } from "./logger.js";

const { Client, LocalAuth } = pkg;

// Lista los nombres EXACTOS de tus grupos para copiar el correcto a WA_GROUP_NAME.
// Reutiliza la sesión ya vinculada (.wwebjs_auth). IMPORTANTE: detén antes el
// `pnpm start` (no pueden correr dos clientes con la misma sesión a la vez).
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter((p): p is string => Boolean(p));
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    ...(executablePath ? { executablePath } : {}),
  },
});

client.on("qr", () =>
  logger.warn("Está pidiendo QR: la sesión no está vinculada. Corre `pnpm start` y escanéalo primero.")
);

client.on("ready", async () => {
  const chats = await client.getChats();
  const groups = chats.filter((c) => c.isGroup);
  logger.info(`Grupos encontrados: ${groups.length}`);
  for (const g of groups) {
    // Comillas para ver espacios/acentos exactos.
    console.log(`  "${g.name}"`);
  }
  console.log("\nCopia el nombre EXACTO (sin las comillas) a WA_GROUP_NAME en .env");
  await client.destroy();
  process.exit(0);
});

client.initialize();
