import { createServer, type IncomingMessage } from "node:http";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { consultarEstatusFolios, PortalFueraDeGestionError, type MantoEstatusResult } from "./manto.js";

// Servidor HTTP mínimo del scraper, para el flujo INVERSO: el dashboard pide
// consultar el estatus de folios SISA en el portal Manto. Mismo molde que
// apps/wa-listener/src/server.ts — node:http sin dependencias extra y el MISMO
// x-internal-key que ya comparten scraper/listener/dashboard.
//
// Por qué vive aquí y no en el dashboard: Manto se consulta con Playwright, y
// este contenedor ya tiene Chromium instalado y corre 24/7 (el scheduler). El
// dashboard (Vercel) no puede abrir un browser headless.
//
// Es BAJO DEMANDA: no hay cron para Manto. Un lock global serializa las
// corridas — Manto es un sistema ajeno y varios clicks no deben abrir varios
// Chromium a la vez.

const MAX_BODY_BYTES = 256 * 1024; // 256 KB: ~10k folios de 8 dígitos en JSON.
const MAX_FOLIOS = 300; // techo por corrida; hoy son ~45 folios en seguimiento.

interface ProgresoRefresh {
  enCurso: boolean;
  total: number;
  consultados: number;
  encontrados: number;
  iniciadoEn: string | null;
  terminadoEn: string | null;
  /** Mensaje de la última corrida: error de portal caído, o resumen al terminar. */
  ultimoMensaje: string | null;
  portalFueraDeGestion: boolean;
}

const progreso: ProgresoRefresh = {
  enCurso: false,
  total: 0,
  consultados: 0,
  encontrados: 0,
  iniciadoEn: null,
  terminadoEn: null,
  ultimoMensaje: null,
  portalFueraDeGestion: false,
};

/**
 * Manda UN resultado al dashboard para que lo guarde. El scraper no habla con
 * Postgres (no tiene Prisma, y por CLAUDE.md las escrituras van por las API
 * routes): reporta igual que sube los CSVs, con x-internal-key.
 */
async function reportarResultado(r: MantoEstatusResult): Promise<void> {
  const url = `${config.dashboardUrl.replace(/\/+$/, "")}/api/sisa/estatus-parcial`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-key": config.internalApiKey },
    body: JSON.stringify({ result: r }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`El dashboard rechazó el resultado [${res.status}]: ${(await res.text()).slice(0, 200)}`);
  }
}

/** Corrida completa en segundo plano: consulta folio por folio y va reportando. */
async function correrRefresh(folios: string[]): Promise<void> {
  progreso.enCurso = true;
  progreso.total = folios.length;
  progreso.consultados = 0;
  progreso.encontrados = 0;
  progreso.iniciadoEn = new Date().toISOString();
  progreso.terminadoEn = null;
  progreso.ultimoMensaje = null;
  progreso.portalFueraDeGestion = false;

  const inicio = Date.now();
  try {
    logger.info("Manto: corrida de estatus iniciada", { folios: folios.length });
    await consultarEstatusFolios(folios, async (r) => {
      progreso.consultados++;
      if (r.found) progreso.encontrados++;
      await reportarResultado(r);
    });
    const segundos = Math.round((Date.now() - inicio) / 1000);
    progreso.ultimoMensaje = `${progreso.encontrados} de ${progreso.total} folios encontrados en Manto (${segundos}s).`;
    logger.info("Manto: corrida completada", {
      total: progreso.total,
      encontrados: progreso.encontrados,
      segundos,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (e instanceof PortalFueraDeGestionError) {
      progreso.portalFueraDeGestion = true;
      progreso.ultimoMensaje = msg;
      logger.warn("Manto: portal fuera de gestión — corrida abortada", {
        detalle: msg,
        consultados: progreso.consultados,
      });
    } else {
      progreso.ultimoMensaje = `Error: ${msg}`;
      logger.error("Manto: corrida falló", { error: msg });
    }
  } finally {
    progreso.enCurso = false;
    progreso.terminadoEn = new Date().toISOString();
  }
}

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

export function startScraperServer(): void {
  const server = createServer((req, res) => {
    const url = req.url ?? "";
    const json = (status: number, obj: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };

    // Health check público: Railway/monitoring pueden pegarle sin la key.
    if (req.method === "GET" && (url === "/health" || url === "/")) {
      json(200, { ok: true, refreshEnCurso: progreso.enCurso });
      return;
    }

    // Progreso de la corrida en curso (o de la última). Autenticado: dice
    // cuántos folios se están consultando.
    if (req.method === "GET" && url === "/sisa-estatus/progreso") {
      if (req.headers["x-internal-key"] !== config.internalApiKey) {
        json(401, { error: "No autorizado" });
        return;
      }
      json(200, { ok: true, progreso });
      return;
    }

    if (req.method !== "POST" || url !== "/sisa-estatus") {
      json(404, { error: "No encontrado" });
      return;
    }

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

      const b = (body ?? {}) as { folios?: unknown };
      // Se filtra a folios numéricos: Manto valida "el EFA debe ser numérico" y
      // el valor se inyecta en un form de un sistema ajeno.
      const folios = Array.isArray(b.folios)
        ? [...new Set(
            b.folios
              .filter((f): f is string => typeof f === "string")
              .map((f) => f.trim())
              .filter((f) => /^\d{1,15}$/.test(f)),
          )]
        : [];

      if (folios.length === 0) {
        json(400, { error: "folios requerido (arreglo de folios numéricos)" });
        return;
      }
      if (folios.length > MAX_FOLIOS) {
        json(400, { error: `Demasiados folios (máximo ${MAX_FOLIOS})` });
        return;
      }
      if (!config.manto.user || !config.manto.password) {
        json(500, { error: "MANTO_USER / MANTO_PASSWORD no configuradas en el scraper" });
        return;
      }
      if (progreso.enCurso) {
        json(409, {
          error: "Ya hay una consulta a Manto en curso",
          progreso,
        });
        return;
      }

      // Responder DE INMEDIATO: la corrida dura ~18 s por folio (~13 min con
      // 45 folios), muy por encima de cualquier timeout HTTP. Los resultados
      // se van guardando uno por uno vía /api/sisa/estatus-parcial, así que la
      // tabla del dashboard se puebla sola conforme avanza.
      void correrRefresh(folios);
      json(202, {
        ok: true,
        iniciado: true,
        total: folios.length,
        message: `Consulta iniciada para ${folios.length} folios.`,
      });
    })();
  });

  server.listen(config.port, () => {
    logger.info("Servidor HTTP del scraper escuchando", { port: config.port });
  });
}
