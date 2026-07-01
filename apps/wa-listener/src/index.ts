import { existsSync } from "node:fs";
// whatsapp-web.js es CommonJS: Node no expone sus clases como named exports vía
// ESM, así que se importa el default y se desestructura. El tipo Message se
// importa como type-only (se borra en runtime, no rompe la carga del módulo).
import pkg from "whatsapp-web.js";
import type { Message } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { postReport } from "./upload.js";

const { Client, LocalAuth } = pkg;

// IM + 2+ letras + dígitos (ej. IMPNOE000070). Misma regex que el API.
const IM_RE = /IM[A-Z]{2,}\d+/;

// Usa el Chrome del sistema si existe (evita descargar los ~150 MB de Chromium
// de puppeteer). CHROME_PATH en el .env tiene prioridad; si no, se prueban las
// rutas estándar de Windows. Si no hay ninguno, puppeteer usa su Chromium bundle.
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter((p): p is string => Boolean(p));
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
  puppeteer: {
    // --no-sandbox: necesario en varios entornos Windows/servidor sin GUI dedicada.
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    ...(executablePath ? { executablePath } : {}),
  },
});

if (executablePath) logger.info("Usando Chrome del sistema", { executablePath });

client.on("qr", (qr) => {
  logger.info(
    "Escanea este QR con el WhatsApp del número de EMPRESA (Ajustes → Dispositivos vinculados → Vincular dispositivo). Solo la 1a vez."
  );
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => logger.info("Sesión de WhatsApp autenticada."));
client.on("auth_failure", (msg) => logger.error("Fallo de autenticación", { msg }));
client.on("disconnected", (reason) => logger.warn("Cliente desconectado", { reason }));

client.on("ready", async () => {
  logger.info("Cliente listo.", { group: config.groupName });
  try {
    await backfill();
  } catch (e) {
    logger.error("Backfill falló", { error: (e as Error).message });
  }
});

// message_create incluye los mensajes ENVIADOS por el propio número (el equipo
// suele reportar desde este mismo teléfono); 'message' solo dispararía con
// mensajes de terceros y perdería los propios.
client.on("message_create", (msg) => {
  void handleMessage(msg, msg.body ?? "");
});

// message_edit: cuando el equipo EDITA el reporte en WhatsApp (p.ej. cambia el
// estatus a resuelto/UP) en vez de mandar uno nuevo. Se usa `newBody` (el texto
// ya editado) y se fuerza sentAt=ahora para que gane sobre la versión anterior.
client.on("message_edit", (msg, newBody) => {
  // newBody viene tipado como `String` (wrapper) en whatsapp-web.js → a primitivo.
  const text = newBody != null ? String(newBody) : msg.body ?? "";
  void handleMessage(msg, text, true);
});

/** Localiza el chat del grupo objetivo por nombre exacto. */
async function resolveGroup() {
  const chats = await client.getChats();
  const chat = chats.find((c) => c.isGroup && c.name === config.groupName);
  if (!chat) logger.error("No se encontró el grupo (revisa WA_GROUP_NAME)", { group: config.groupName });
  return chat;
}

/** Al arrancar, relee los últimos N mensajes para recuperar lo perdido. */
async function backfill() {
  const chat = await resolveGroup();
  if (!chat) return;
  const messages = await chat.fetchMessages({ limit: config.backfillLimit });
  logger.info("Backfill: releyendo mensajes recientes", { fetched: messages.length });
  for (const msg of messages) {
    await handleMessage(msg, msg.body ?? "");
  }
}

/**
 * Procesa un mensaje: si trae un IM y es del grupo objetivo, lo manda al dashboard.
 * `body` se pasa explícito para poder usar el texto editado en message_edit.
 * `isEdit` fuerza sentAt=ahora para que la edición gane sobre la versión previa.
 */
async function handleMessage(msg: Message, body: string, isEdit = false) {
  const match = body.match(IM_RE);
  if (!match) return;

  const incidentId = match[0].toUpperCase();
  // Los incidentes CARE (IMCARE...) no son de PEXA — no se traen.
  if (incidentId.startsWith("IMCARE")) return;

  // Confirmar que el mensaje pertenece al grupo objetivo (no a otro chat).
  let chatName = "";
  try {
    const chat = await msg.getChat();
    chatName = chat.name ?? "";
  } catch {
    return;
  }
  if (chatName !== config.groupName) return;

  const sentAt = (isEdit ? new Date() : new Date(msg.timestamp * 1000)).toISOString();

  try {
    await postReport({ incidentId, rawText: body, sentAt });
    logger.info("Reporte enviado al dashboard", { incidentId, edit: isEdit });
  } catch (e) {
    logger.error("Error enviando reporte", { incidentId, error: (e as Error).message });
  }
}

client.initialize();
logger.info("Inicializando wa-listener…", { dashboard: config.dashboardUrl });
