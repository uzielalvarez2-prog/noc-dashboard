import { createServer, type IncomingMessage } from "node:http";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { consultarEstatusFolios, PortalFueraDeGestionError, type MantoEstatusResult } from "./manto.js";
import { IM_REGEX, type ImEstatusResult } from "./hpsm-incident.js";

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

// ── Estatus de IMs en HPSM (bajo demanda, solo ADMIN en el dashboard) ────────
// A diferencia de Manto, esto SÍ entra a HPSM: corre como job hijo del
// scheduler (runJob) para compartir la fila con open/sisa/closed. El hijo
// escribe sus resultados en IM_ESTATUS_FILE tras cada IM; aquí solo se lee.

const MAX_IMS = 50;
const IM_ESTATUS_FILE = join(process.cwd(), "im-estatus.json");

export interface ScraperServerDeps {
  /** Encola run-im-estatus en el scheduler. Resuelve false si no llegó a correr. */
  runImEstatus(env: NodeJS.ProcessEnv): Promise<boolean>;
  /** Encola run-cerrar en el scheduler. Resuelve false si no llegó a correr. */
  runCerrar(env: NodeJS.ProcessEnv): Promise<boolean>;
}

interface ProgresoIm {
  estado: "inactivo" | "en_cola" | "consultando" | "terminado" | "error";
  total: number;
  iniciadoEn: string | null;
  terminadoEn: string | null;
  mensaje: string | null;
}

const progresoIm: ProgresoIm = {
  estado: "inactivo",
  total: 0,
  iniciadoEn: null,
  terminadoEn: null,
  mensaje: null,
};

function leerResultadosIm(): ImEstatusResult[] {
  try {
    return JSON.parse(readFileSync(IM_ESTATUS_FILE, "utf8")) as ImEstatusResult[];
  } catch {
    return [];
  }
}

async function correrImEstatus(deps: ScraperServerDeps, ims: string[]): Promise<void> {
  try {
    if (existsSync(IM_ESTATUS_FILE)) unlinkSync(IM_ESTATUS_FILE);
  } catch { /* se sobrescribe igual */ }
  Object.assign(progresoIm, {
    estado: "en_cola",
    total: ims.length,
    iniciadoEn: new Date().toISOString(),
    terminadoEn: null,
    mensaje: null,
  });
  try {
    const corrio = await deps.runImEstatus({ IM_LIST: ims.join(","), IM_ESTATUS_OUT: IM_ESTATUS_FILE });
    const n = leerResultadosIm().length;
    if (!corrio) {
      progresoIm.estado = "error";
      progresoIm.mensaje = "El scraper siguió ocupado con otra corrida de HPSM; intenta de nuevo en unos minutos.";
    } else if (n < ims.length) {
      progresoIm.estado = "error";
      progresoIm.mensaje = `La consulta se interrumpió: ${n} de ${ims.length} IMs consultados (ver logs del scraper).`;
    } else {
      progresoIm.estado = "terminado";
      progresoIm.mensaje = `${n} IMs consultados.`;
    }
  } catch (e) {
    progresoIm.estado = "error";
    progresoIm.mensaje = `Error: ${(e as Error).message}`;
  } finally {
    progresoIm.terminadoEn = new Date().toISOString();
  }
}

// ── Estatus Cliente TOP → WhatsApp (consulta + callback) ─────────────────────
// El dashboard (Vercel) no puede mantener una petición abierta los ~4 min que
// tarda consultar los IMs en HPSM: la función serverless se corta. Por eso el
// trabajo lento vive aquí (proceso 24/7). El dashboard manda la tarea con los
// IMs ya resueltos del cliente, este endpoint responde 202 de inmediato,
// consulta HPSM en segundo plano reusando el MISMO job que /im-estatus, y al
// terminar hace callback al dashboard con los resultados crudos para que ARME
// el mensaje y lo ENVÍE al grupo (la lógica de formato/envío vive solo allá).

interface TareaClienteTop {
  // Datos opacos para el scraper: se devuelven tal cual en el callback para que
  // el dashboard sepa a qué corrida corresponden y cómo formatear.
  chatId: string;
  prefijo: string;
  etiqueta: string;
  items: unknown; // [{ incidentId, ref, siteName }]; el scraper no los interpreta
  // Modo multi-cliente: un GrupoEnvio por cliente destino ({ chatId, etiqueta,
  // prefijo, items }). Opaco para el scraper: se devuelve tal cual en el callback.
  grupos: unknown[];
  enviarSiVacio: boolean;
}

let clienteTopEnCurso = false;

async function correrClienteTop(
  deps: ScraperServerDeps,
  ims: string[],
  tarea: TareaClienteTop,
): Promise<void> {
  clienteTopEnCurso = true;
  try {
    // Reusa el job de IM-estatus (serializado con open/sisa/closed vía runJob).
    let resultados: ImEstatusResult[] = [];
    if (ims.length > 0) {
      try {
        if (existsSync(IM_ESTATUS_FILE)) unlinkSync(IM_ESTATUS_FILE);
      } catch { /* se sobrescribe igual */ }
      const corrio = await deps.runImEstatus({
        IM_LIST: ims.join(","),
        IM_ESTATUS_OUT: IM_ESTATUS_FILE,
      });
      resultados = leerResultadosIm();
      if (!corrio) {
        logger.warn("cliente-top: el job de IM-estatus no llegó a correr (scraper ocupado)");
      }
    }

    // Callback al dashboard: él arma el mensaje y lo envía al grupo.
    const url = `${config.dashboardUrl.replace(/\/+$/, "")}/api/cliente-top/enviar`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": config.internalApiKey },
      body: JSON.stringify({
        chatId: tarea.chatId,
        prefijo: tarea.prefijo,
        etiqueta: tarea.etiqueta,
        items: tarea.items,
        grupos: tarea.grupos,
        enviarSiVacio: tarea.enviarSiVacio,
        resultados,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.text();
    logger.info(`cliente-top: callback al dashboard ${res.status} ${body.slice(0, 200)}`);
  } catch (e) {
    logger.error("cliente-top: fallo en la corrida", { err: String(e) });
  } finally {
    clienteTopEnCurso = false;
  }
}

// ── Cierre de IMs en HPSM (bajo demanda, solo ADMIN) ─────────────────────────
// Mismo molde que estatus de IMs: job hijo run-cerrar vía runCerrar, resultados
// en CERRAR_FILE reescrito tras cada IM, progreso leído aquí. El cliente manda
// pares { im, template } y el modo (verificar | aplicar | cerrar).

const MAX_CERRAR = 50;
const CERRAR_FILE = join(process.cwd(), "cerrar-estatus.json");

type ModoCierre = "verificar" | "aplicar" | "cerrar";

interface CierreResult {
  im: string;
  template: string;
  modo: ModoCierre;
  ok: boolean;
  resultado: string;
  mensaje: string;
  statusPrevio?: string;
}

interface ProgresoCierre {
  estado: "inactivo" | "en_cola" | "cerrando" | "terminado" | "error";
  total: number;
  modo: ModoCierre;
  iniciadoEn: string | null;
  terminadoEn: string | null;
  mensaje: string | null;
}

const progresoCierre: ProgresoCierre = {
  estado: "inactivo",
  total: 0,
  modo: "verificar",
  iniciadoEn: null,
  terminadoEn: null,
  mensaje: null,
};

function leerResultadosCierre(): CierreResult[] {
  try {
    return JSON.parse(readFileSync(CERRAR_FILE, "utf8")) as CierreResult[];
  } catch {
    return [];
  }
}

async function correrCierre(
  deps: ScraperServerDeps,
  items: { im: string; template: string }[],
  modo: ModoCierre,
): Promise<void> {
  try {
    if (existsSync(CERRAR_FILE)) unlinkSync(CERRAR_FILE);
  } catch { /* se sobrescribe igual */ }
  Object.assign(progresoCierre, {
    estado: "en_cola",
    total: items.length,
    modo,
    iniciadoEn: new Date().toISOString(),
    terminadoEn: null,
    mensaje: null,
  });
  try {
    // CERRAR_LIST con pares "IM=template" para que cada IM lleve el suyo.
    const lista = items.map((it) => `${it.im}=${it.template}`).join(",");
    const corrio = await deps.runCerrar({ CERRAR_LIST: lista, CERRAR_MODO: modo, CERRAR_OUT: CERRAR_FILE });
    const resultados = leerResultadosCierre();
    const n = resultados.length;
    if (!corrio) {
      progresoCierre.estado = "error";
      progresoCierre.mensaje = "El scraper siguió ocupado con otra corrida de HPSM; intenta de nuevo en unos minutos.";
    } else if (n < items.length) {
      progresoCierre.estado = "error";
      progresoCierre.mensaje = `La corrida se interrumpió: ${n} de ${items.length} IMs procesados (ver logs del scraper).`;
    } else {
      const ok = resultados.filter((r) => r.ok).length;
      progresoCierre.estado = "terminado";
      progresoCierre.mensaje = `${ok} de ${n} IMs OK (modo ${modo}).`;
    }
  } catch (e) {
    progresoCierre.estado = "error";
    progresoCierre.mensaje = `Error: ${(e as Error).message}`;
  } finally {
    progresoCierre.terminadoEn = new Date().toISOString();
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

export function startScraperServer(deps: ScraperServerDeps): void {
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

    if (req.method === "GET" && url === "/im-estatus/progreso") {
      if (req.headers["x-internal-key"] !== config.internalApiKey) {
        json(401, { error: "No autorizado" });
        return;
      }
      // "en_cola" pasa a "consultando" en cuanto el hijo crea el archivo.
      const estado =
        progresoIm.estado === "en_cola" && existsSync(IM_ESTATUS_FILE) ? "consultando" : progresoIm.estado;
      json(200, { ok: true, progreso: { ...progresoIm, estado }, resultados: leerResultadosIm() });
      return;
    }

    if (req.method === "POST" && url === "/im-estatus") {
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
        const b = (body ?? {}) as { ims?: unknown };
        // Solo IMs con formato válido: el valor va dentro de una query de HPSM.
        const ims = Array.isArray(b.ims)
          ? [...new Set(
              b.ims
                .filter((s): s is string => typeof s === "string")
                .map((s) => s.trim().toUpperCase())
                .filter((s) => IM_REGEX.test(s)),
            )]
          : [];
        if (ims.length === 0) {
          json(400, { error: "ims requerido (arreglo de números de incidente IM…)" });
          return;
        }
        if (ims.length > MAX_IMS) {
          json(400, { error: `Demasiados IMs (máximo ${MAX_IMS})` });
          return;
        }
        if (progresoIm.estado === "en_cola" || progresoIm.estado === "consultando") {
          json(409, { error: "Ya hay una consulta de IMs en curso" });
          return;
        }
        void correrImEstatus(deps, ims);
        json(202, { ok: true, iniciado: true, total: ims.length });
      })();
      return;
    }

    // ── Estatus Cliente TOP → WhatsApp ───────────────────────────────────────
    if (req.method === "POST" && url === "/cliente-top-estatus") {
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
        const b = (body ?? {}) as {
          ims?: unknown;
          chatId?: unknown;
          prefijo?: unknown;
          etiqueta?: unknown;
          items?: unknown;
          grupos?: unknown;
          enviarSiVacio?: unknown;
        };
        const ims = Array.isArray(b.ims)
          ? [...new Set(
              b.ims
                .filter((s): s is string => typeof s === "string")
                .map((s) => s.trim().toUpperCase())
                .filter((s) => IM_REGEX.test(s)),
            )]
          : [];
        if (ims.length > MAX_IMS) {
          json(400, { error: `Demasiados IMs (máximo ${MAX_IMS})` });
          return;
        }
        const chatId = typeof b.chatId === "string" ? b.chatId.trim() : "";
        const grupos = Array.isArray(b.grupos) ? b.grupos : [];
        // Modo multi-cliente (grupos) no manda chatId global: cada grupo lleva el
        // suyo. Solo se exige chatId cuando NO hay grupos (modo single legacy).
        if (!chatId && grupos.length === 0) {
          json(400, { error: "chatId o grupos requerido" });
          return;
        }
        if (clienteTopEnCurso || progresoIm.estado === "en_cola" || progresoIm.estado === "consultando") {
          json(409, { error: "Ya hay una consulta de IMs en curso" });
          return;
        }
        const tarea: TareaClienteTop = {
          chatId,
          prefijo: typeof b.prefijo === "string" ? b.prefijo : "",
          etiqueta: typeof b.etiqueta === "string" ? b.etiqueta : "PEXA",
          items: Array.isArray(b.items) ? b.items : [],
          grupos,
          enviarSiVacio: b.enviarSiVacio === true,
        };
        void correrClienteTop(deps, ims, tarea);
        json(202, { ok: true, iniciado: true, total: ims.length });
      })();
      return;
    }

    // ── Cierre de IMs ────────────────────────────────────────────────────────
    if (req.method === "GET" && url === "/cerrar-incidentes/progreso") {
      if (req.headers["x-internal-key"] !== config.internalApiKey) {
        json(401, { error: "No autorizado" });
        return;
      }
      const estado =
        progresoCierre.estado === "en_cola" && existsSync(CERRAR_FILE) ? "cerrando" : progresoCierre.estado;
      json(200, { ok: true, progreso: { ...progresoCierre, estado }, resultados: leerResultadosCierre() });
      return;
    }

    if (req.method === "POST" && url === "/cerrar-incidentes") {
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
        const b = (body ?? {}) as { items?: unknown; modo?: unknown };
        const modoRaw = typeof b.modo === "string" ? b.modo : "verificar";
        const modo: ModoCierre =
          modoRaw === "cerrar" || modoRaw === "aplicar" ? (modoRaw as ModoCierre) : "verificar";
        // items: [{ im, template }]. IM validado contra IM_REGEX; template no
        // vacío. Se deduplica por IM (el último gana).
        const porIm = new Map<string, { im: string; template: string }>();
        if (Array.isArray(b.items)) {
          for (const it of b.items) {
            const o = (it ?? {}) as { im?: unknown; template?: unknown };
            const im = typeof o.im === "string" ? o.im.trim().toUpperCase() : "";
            const template = typeof o.template === "string" ? o.template.trim() : "";
            if (IM_REGEX.test(im) && template) porIm.set(im, { im, template });
          }
        }
        const items = [...porIm.values()];
        if (items.length === 0) {
          json(400, { error: "items requerido: [{ im, template }] con IM válido y template no vacío" });
          return;
        }
        if (items.length > MAX_CERRAR) {
          json(400, { error: `Demasiados IMs (máximo ${MAX_CERRAR})` });
          return;
        }
        if (progresoCierre.estado === "en_cola" || progresoCierre.estado === "cerrando") {
          json(409, { error: "Ya hay una corrida de cierre en curso" });
          return;
        }
        void correrCierre(deps, items, modo);
        json(202, { ok: true, iniciado: true, total: items.length, modo });
      })();
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
