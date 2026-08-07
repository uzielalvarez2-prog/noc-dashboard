import { createServer, type IncomingMessage } from "node:http";
import { config } from "./config.js";
import { logger } from "./logger.js";

// Servidor HTTP mínimo para el flujo INVERSO: el dashboard pide enviar un
// mensaje a un grupo. Se usa node:http (sin dependencias extra). Autenticado con
// el MISMO x-internal-key que ya comparten scraper/listener/dashboard.
//
// El envío real lo hace `sendToGroup` de index.ts, que reusa el client de
// WhatsApp ya autenticado (NUNCA una segunda sesión). Aquí solo validamos y
// delegamos. `isReady` evita intentar mandar antes de que el client esté listo.

interface SendDeps {
  sendToGroup: (chatId: string, text: string, mentions?: string[]) => Promise<void>;
  isReady: () => boolean;
}

const MAX_BODY_BYTES = 64 * 1024; // 64 KB: un mensaje de WhatsApp jamás se acerca.

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Body demasiado grande"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"));
      } catch {
        reject(new Error("JSON inválido"));
      }
    });
    req.on("error", reject);
  });
}

export function startSendServer({ sendToGroup, isReady }: SendDeps): void {
  const server = createServer((req, res) => {
    const url = req.url ?? "";
    const json = (status: number, obj: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };

    // Health check público: Railway/monitoring pueden pegarle sin la key.
    if (req.method === "GET" && (url === "/health" || url === "/")) {
      json(200, { ok: true, ready: isReady() });
      return;
    }

    if (req.method !== "POST" || url !== "/send") {
      json(404, { error: "No encontrado" });
      return;
    }

    // Autenticación: mismo header x-internal-key que el resto del sistema.
    if (req.headers["x-internal-key"] !== config.internalApiKey) {
      json(401, { error: "No autorizado" });
      return;
    }

    void (async () => {
      let body: unknown;
      try {
        body = await readJsonBody(req);
      } catch (e) {
        json(400, { error: (e as Error).message });
        return;
      }

      const b = (body ?? {}) as { chatId?: unknown; text?: unknown; mentions?: unknown };
      const chatId = typeof b.chatId === "string" ? b.chatId.trim() : "";
      const text = typeof b.text === "string" ? b.text : "";
      // Se descarta cualquier JID mal formado en vez de rechazar el envío: la
      // alerta importa más que la mención.
      const mentions = Array.isArray(b.mentions)
        ? b.mentions.filter((m): m is string => typeof m === "string" && /^\d+@c\.us$/.test(m))
        : [];
      if (!chatId) return json(400, { error: "chatId requerido" });
      if (!text.trim()) return json(400, { error: "text vacío" });

      if (!isReady()) {
        return json(503, { error: "WhatsApp aún no está listo (reintentar)" });
      }

      try {
        await sendToGroup(chatId, text, mentions);
        json(200, { ok: true });
      } catch (e) {
        const msg = (e as Error).message;
        logger.error("Fallo al enviar mensaje", { chatId, error: msg });
        json(502, { error: msg });
      }
    })();
  });

  const port = config.sendServerPort;
  server.listen(port, () => {
    logger.info("Servidor de envío HTTP escuchando", { port });
  });
}
