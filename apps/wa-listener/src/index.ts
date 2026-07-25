import { existsSync, rmSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
// whatsapp-web.js es CommonJS: Node no expone sus clases como named exports vía
// ESM, así que se importa el default y se desestructura. El tipo Message se
// importa como type-only (se borra en runtime, no rompe la carga del módulo).
import pkg from "whatsapp-web.js";
import type { Message } from "whatsapp-web.js";
import puppeteer from "puppeteer";
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { postReport } from "./upload.js";
import { startSendServer } from "./server.js";

const { Client, LocalAuth } = pkg;

// IM + 2+ letras + dígitos (ej. IMPNOE000070). Misma regex que el API.
// Flag `g` para capturar TODOS los IM de un mensaje con matchAll.
const IM_RE_GLOBAL = /IM[A-Z]{2,}\d+/g;

// Por defecto usa el Chromium propio de puppeteer (aislado): así NO choca con el
// Chrome personal del usuario abierto en la PC — cuando compartían ejecutable, el
// inject de whatsapp-web.js crasheaba con "Execution context was destroyed".
// whatsapp-web.js usa puppeteer-CORE, que no auto-detecta browser: hay que darle
// la ruta. puppeteer.executablePath() resuelve el Chromium instalado con
// `puppeteer browsers install chrome`. CHROME_PATH (explícito y existente) manda.
const explicitChrome = process.env.CHROME_PATH;
let executablePath: string | undefined;
if (explicitChrome && existsSync(explicitChrome)) {
  executablePath = explicitChrome;
} else {
  try {
    const p = puppeteer.executablePath();
    executablePath = existsSync(p) ? p : undefined;
  } catch {
    executablePath = undefined;
  }
}

// dataPath de la sesión de WhatsApp. En local es "./.wwebjs_auth"; en la nube
// (Railway) se apunta a un VOLUMEN persistente vía WA_SESSION_DIR para que la
// sesión sobreviva a los redeploys (si no, cada deploy pediría re-escanear QR).
const sessionDir = process.env.WA_SESSION_DIR ?? "./.wwebjs_auth";

// Chromium marca el perfil con un SingletonLock/SingletonSocket cuando arranca; si
// el contenedor murió sin cerrar limpio (o el perfil se copió con el lock puesto),
// el siguiente arranque falla con "profile appears to be in use by another Chromium
// process". En un contenedor recién arrancado NUNCA hay otro Chromium real usando
// el perfil, así que se borran estos locks al iniciar. LocalAuth anida el perfil en
// subcarpetas de nombre variable, así que se busca el lock recursivamente.
const LOCK_NAMES = new Set(["SingletonLock", "SingletonSocket", "SingletonCookie"]);
function clearChromiumLocks(dir: string): void {
  if (!existsSync(dir)) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (LOCK_NAMES.has(entry)) {
      try {
        rmSync(full, { force: true, recursive: true });
        logger.info("Lock de Chromium eliminado", { path: full });
      } catch {
        /* no-op */
      }
      continue;
    }
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      isDir = false;
    }
    if (isDir) clearChromiumLocks(full);
  }
}
clearChromiumLocks(sessionDir);

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: sessionDir }),
  // Fija una versión estable de WhatsApp Web servida remotamente. Sin esto, la
  // librería carga la versión "live" que WhatsApp despliega, y cuando esa cambia
  // el inject crashea con "Execution context was destroyed" (2026-07-04). El
  // patrón webVersionCache remoto es la solución documentada de whatsapp-web.js.
  webVersionCache: {
    type: "remote",
    remotePath:
      "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1042630100-alpha.html",
  },
  puppeteer: {
    // --no-sandbox: necesario en varios entornos Windows/servidor sin GUI dedicada.
    // --disable-dev-shm-usage: en contenedores (Railway) /dev/shm es diminuto y
    //   Chromium crashea al arrancar sin este flag; lo manda a /tmp. Imprescindible
    //   para que el evento 'qr' llegue a dispararse en la nube.
    // --disable-gpu / --single-process: headless sin GPU en contenedor.
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
    // El contenedor de Railway es más lento que la PC: el backfill (fetchMessages
    // de 50 mensajes) excedía el protocolTimeout default y crasheaba el cliente en
    // bucle ("Runtime.callFunctionOn timed out"). Se sube a 5 min para dar margen.
    protocolTimeout: 300_000,
    ...(executablePath ? { executablePath } : {}),
  },
});

logger.info(
  explicitChrome && executablePath === explicitChrome
    ? `Usando Chrome del sistema (CHROME_PATH): ${executablePath}`
    : executablePath
      ? `Usando Chromium propio de puppeteer (aislado): ${executablePath}`
      : "Sin executablePath — puppeteer-core intentará su default (puede fallar)",
);

// true una vez que el evento 'ready' disparó (client autenticado y operativo).
// El servidor HTTP de envío lo consulta para no intentar mandar antes de tiempo.
let clientReady = false;

client.on("qr", (qr) => {
  logger.info(
    "Escanea este QR con el WhatsApp del número de EMPRESA (Ajustes → Dispositivos vinculados → Vincular dispositivo). Solo la 1a vez."
  );
  // El QR ASCII se fragmenta en el visor de logs de Railway y el celular no lo
  // lee. Como respaldo confiable se imprime el QR como DATA URL (PNG en base64):
  // se copia la línea completa del log, se pega en la barra del navegador y se
  // abre una imagen nítida del QR — sin depender de ningún servicio externo. El
  // token del QR es efímero (~60s) y no es un secreto persistente.
  QRCode.toDataURL(qr, { width: 300, margin: 2 })
    .then((dataUrl) =>
      logger.info(
        `QR como imagen — copia TODO lo que sigue y pégalo en la barra del navegador:\n${dataUrl}`,
      ),
    )
    .catch((e) => logger.error("No se pudo generar QR data-url", { error: (e as Error).message }));
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => logger.info("Sesión de WhatsApp autenticada."));
client.on("auth_failure", (msg) => logger.error("Fallo de autenticación", { msg }));
client.on("disconnected", (reason) => {
  clientReady = false;
  logger.warn("Cliente desconectado", { reason });
});

client.on("ready", async () => {
  clientReady = true;
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

/** Localiza el chat de un grupo por nombre EXACTO. */
async function resolveGroupByName(name: string) {
  const chats = await client.getChats();
  return chats.find((c) => c.isGroup && c.name === name);
}

/**
 * Envía un texto a un grupo por su nombre exacto. Usado por el servidor HTTP
 * (server.ts) cuando el dashboard pide mandar un mensaje. Reusa el MISMO client
 * ya autenticado — no se abre una segunda sesión de WhatsApp.
 * Lanza si el grupo no existe o si el cliente aún no está listo.
 */
export async function sendToGroup(groupName: string, text: string): Promise<void> {
  const chat = await resolveGroupByName(groupName);
  if (!chat) throw new Error(`Grupo no encontrado: ${groupName}`);
  await client.sendMessage(chat.id._serialized, text);
  logger.info("Mensaje enviado a grupo", { group: groupName, chars: text.length });
}

export function isClientReady(): boolean {
  return clientReady;
}

/** Al arrancar, relee los últimos N mensajes para recuperar lo perdido. */
async function backfill() {
  const chat = await resolveGroupByName(config.groupName);
  if (!chat) {
    logger.error("No se encontró el grupo (revisa WA_GROUP_NAME)", { group: config.groupName });
    return;
  }
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
  // Capturar TODOS los IM del mensaje (un mensaje puede listar varios).
  const allMatches = [...body.matchAll(IM_RE_GLOBAL)].map((m) => m[0].toUpperCase());
  if (allMatches.length === 0) return;

  // Los incidentes CARE (IMCARE...) no son de PEXA — se saltan, pero NO se
  // descarta el mensaje: los demás IM del mismo texto sí se procesan.
  const incidentIds = [...new Set(allMatches)].filter((id) => !id.startsWith("IMCARE"));
  if (incidentIds.length === 0) return;

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

  for (const incidentId of incidentIds) {
    try {
      await postReport({ incidentId, rawText: body, sentAt });
      logger.info("Reporte enviado al dashboard", { incidentId, edit: isEdit });
    } catch (e) {
      logger.error("Error enviando reporte", { incidentId, error: (e as Error).message });
    }
  }
}

// Servidor HTTP de envío (flujo dashboard → WhatsApp). Arranca de inmediato para
// responder /health aunque el client aún esté vinculándose; los envíos esperan a
// que isClientReady() sea true.
startSendServer({ sendToGroup, isReady: isClientReady });

client.initialize();
logger.info("Inicializando wa-listener…", {
  dashboard: config.dashboardUrl,
  sessionDir,
});
