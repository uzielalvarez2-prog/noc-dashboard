import { chromium, type Browser, type Page } from "playwright";
import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * Portal Manto (SISA Mantenimiento — http://200.57.157.167/manto). Sistema
 * de Telmex, ajeno a nosotros: solo lo consultamos bajo demanda (nunca cron),
 * y solo por los folios que ya tenemos en SisaTicket.vendorTicket.
 *
 * Estructura confirmada a mano (exploración 2026-09-12):
 *  1. Login: POST a /manto/servlet/seguridad.AccesoUsuario vía form1
 *     (inputs #usuario / #password). Frameset clásico tras login.
 *  2. Con la sesión abierta, VentanaZoom.jsp?tipo=EFA&folio=N devuelve DIRECTO
 *     el <textarea> con toda la bitácora del folio (ver descargarNotasEfa).
 *
 * ── Cambio 2026-10-01: SOLO NOTAS, por petición directa ──────────────────────
 * Antes se obtenía además el ESTATUS (Edo. EMS/EFA) navegando tres frames
 * encadenados (form2.submit → BusquedaEfa.jsp → ListaEmsEscalador.jsp?folioefa=N).
 * Ese camino tardaba ~18 s/folio (~13 min con ~45 folios) y era lo que rompía la
 * actualización cuando el portal iba lento. El usuario sólo necesita las NOTAS,
 * así que ese baile de frames se eliminó: ahora cada folio es UNA petición
 * directa a VentanaZoom (~80-125 ms medidos → ~6-10 s para 45 folios).
 *
 * El estatus EMS/EFA ya NO se consulta: los resultados vienen sin estadoEms/
 * estadoEfa y la ruta estatus-parcial los deja en null al refrescar cada folio
 * ("vaciar al correr cada folio"). Para reactivarlo cuando el flujo de frames
 * valga la pena otra vez, restaurar consultarFolioConFrames (ver historial git).
 *
 * El código de parseo de la tabla (parseResultFrame) y el espaciado de frames
 * quedan sin uso a propósito, como referencia para esa reactivación.
 */

export interface MantoEstatusResult {
  folio: string;
  found: boolean;
  estadoEms?: string;
  estadoEfa?: string;
  fechaEstadoEfa?: string; // tal cual la reporta Manto, ej. "11/09/2026 18:34:56"
  fechaEstadoEms?: string; // "F/H Ini." del EMS — la que el formato EDC usa como "Inicio:"
  /** Resumen depurado de las notas del EFA (ver extraerNotasEfa). */
  notasEfa?: string;
  error?: string;
}

/**
 * El portal se cae con cierta frecuencia y, cuando eso pasa, responde con
 * errores de SQL / excepciones de servidor / páginas vacías en vez de negar el
 * folio. Eso NO debe registrarse como "folio no encontrado" (borraría el
 * seguimiento de un folio que sí existe): se aborta la corrida completa.
 */
export class PortalFueraDeGestionError extends Error {
  constructor(detalle: string) {
    super(`Portal fuera de gestión: ${detalle}`);
    this.name = "PortalFueraDeGestionError";
  }
}

// Huellas de portal caído en el HTML de respuesta. Manto es JSP + Oracle: un
// fallo de base o de servidor sale como stacktrace/ORA-xxxxx/500 crudo.
const HUELLAS_PORTAL_CAIDO = [
  /ORA-\d{4,5}/i, // error de Oracle, ej. ORA-03113, ORA-12541
  /SQLException|SQLSyntaxError|JDBC|DataSource/i,
  /javax\.servlet|org\.apache\.jasper|java\.lang\.\w*Exception/i,
  /HTTP Status 50\d|Internal Server Error|Service Unavailable/i,
  /Error 500--/i,
];

function detectarPortalCaido(html: string): string | null {
  for (const re of HUELLAS_PORTAL_CAIDO) {
    const m = html.match(re);
    if (m) return m[0];
  }
  return null;
}

interface MantoSession {
  browser: Browser;
  page: Page;
  close(): Promise<void>;
}

async function openMantoSession(): Promise<MantoSession> {
  if (!config.manto.user || !config.manto.password) {
    throw new Error("MANTO_USER / MANTO_PASSWORD no configuradas");
  }

  const browser = await chromium.launch({ headless: !config.headed });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();

  logger.info(`Navegando a Manto: ${config.manto.url}`);
  let resp;
  try {
    resp = await page.goto(config.manto.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  } catch (e) {
    await browser.close();
    // Ni siquiera respondió el HTTP: portal caído o red bloqueada.
    throw new PortalFueraDeGestionError(`no responde (${(e as Error).message})`);
  }

  if (resp && resp.status() >= 500) {
    await browser.close();
    throw new PortalFueraDeGestionError(`HTTP ${resp.status()} en la página de acceso`);
  }
  const huellaLogin = detectarPortalCaido(await page.content());
  if (huellaLogin) {
    await browser.close();
    throw new PortalFueraDeGestionError(huellaLogin);
  }

  // Si el portal está a medias, la página de acceso carga pero sin el form.
  const hayForm = await page
    .locator("#usuario")
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!hayForm) {
    await browser.close();
    throw new PortalFueraDeGestionError("la página de acceso no muestra el formulario de login");
  }
  await page.locator("#usuario").fill(config.manto.user);
  await page.locator("#password").fill(config.manto.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => {}),
    page.locator('form[name="form1"]').evaluate((f: HTMLFormElement) => f.submit()),
  ]);
  await page.waitForTimeout(1_500);

  const stillOnLogin = await page.locator("#usuario").isVisible({ timeout: 2_000 }).catch(() => false);
  if (stillOnLogin) {
    await browser.close();
    throw new Error("Manto: login fallido — credenciales inválidas");
  }

  // El camino directo (VentanaZoom) solo necesita las cookies de sesión, no el
  // frame MarcoMenu/form2 de búsqueda — así que ya no se espera a que monte el
  // frameset completo (eso agregaba hasta 20 s al arranque). La sesión queda
  // lista en cuanto el login deja de mostrar el form de acceso.

  return {
    browser,
    page,
    close: async () => {
      await browser.close();
    },
  };
}

/** Señal interna: VentanaZoom respondió HTTP 500 para este folio. Es la
 * respuesta de Manto a un folio purgado (el JSP revienta en vez de negar
 * limpio). El llamador lo trata SIEMPRE como "folio no encontrado" y sigue
 * con el resto — ver consultarEstatusFolios. */
class FolioHttp500Error extends Error {
  constructor(public readonly status: number) {
    super(`VentanaZoom respondió HTTP ${status}`);
    this.name = "FolioHttp500Error";
  }
}

/**
 * Consulta las NOTAS de UN folio en Manto por petición directa a VentanaZoom,
 * reusando la sesión ya autenticada. Ya NO navega el frameset de búsqueda ni
 * obtiene el estatus (Edo. EMS/EFA) — ver el encabezado del archivo.
 *
 * Distinción de errores (importante para no abortar de más):
 *  - HTTP 500 → lanza FolioHttp500Error, que el llamador trata como folio
 *    purgado (saltar y seguir). NO se usa como señal de portal caído: Manto
 *    devuelve 500 para cada folio purgado, y una tanda real trae varios viejos.
 *  - Huella de error de Oracle/servlet en el cuerpo (ORA-xxxx, stacktrace) →
 *    portal caído inequívoco: aborta la corrida completa.
 */
async function consultarFolio(page: Page, folio: string): Promise<MantoEstatusResult> {
  const origen = new URL(config.manto.url).origin;
  const res = await page.context().request.get(
    `${origen}/manto/jsp/VentanaZoom.jsp?tipo=EFA&folio=${folio}`,
    { timeout: 20_000 },
  );

  if (res.status() >= 500) {
    throw new FolioHttp500Error(res.status());
  }
  if (!res.ok()) {
    return { folio, found: false, error: `Manto respondió HTTP ${res.status()}` };
  }

  // Los acentos llegan como "?" ("S?BADO", "Asignaci?n"): NO es un problema de
  // decodificación de aquí — Manto ya tiene el signo de interrogación guardado
  // en sus datos (se comprobó leyendo el buffer como iso-8859-1, mismo
  // resultado). La letra original no es recuperable.
  const html = await res.text();
  // Error de SQL/servlet DENTRO de una respuesta 200 = portal a medio caer:
  // aborta la corrida completa en vez de marcar este folio como sin notas.
  const huella = detectarPortalCaido(html);
  if (huella) throw new PortalFueraDeGestionError(huella);

  const notasEfa = extraerNotasEfa(html);
  // Sin <textarea> aprovechable: el folio existe pero no tiene bitácora útil.
  // Se marca como encontrado (found) con notas vacías — al persistir, la ruta
  // estatus-parcial deja estadoEms/estadoEfa en null ("vaciar al correr").
  return { folio, found: true, notasEfa };
}

/** Entidades HTML + acentos rotos de iso-8859-1, y \r sueltos → saltos de línea. */
function decodificarTextoManto(raw: string): string {
  return raw
    .replace(/&#13;/g, "\n")
    .replace(/&#10;/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Arma el resumen de notas a partir del HTML de VentanaZoom. Devuelve undefined
 * si no hay nada aprovechable (el EDC entonces conserva su texto por defecto).
 */
export function extraerNotasEfa(htmlZoom: string): string | undefined {
  const m = htmlZoom.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/i);
  if (!m) return undefined;

  const texto = decodificarTextoManto(m[1]);
  if (!texto.trim()) return undefined;

  // Partir el texto en párrafos: grupos de líneas separados por una o más
  // líneas en blanco. Cada párrafo se limpia internamente (trim por línea).
  const parrafos = texto
    .split(/\n{2,}|\r\n(\r\n)+/)   // 2+ saltos de línea = separador de párrafo
    .map((bloque) =>
      bloque
        .split(/[\r\n]+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean);              // descartar párrafos vacíos

  if (parrafos.length === 0) return undefined;

  // Tomar los últimos 4 párrafos (los más recientes — Manto acumula de más
  // antiguo a más nuevo, de arriba a abajo).
  const ultimos = parrafos.slice(-4);

  return ultimos.join("\n\n").trim();
}

/**
 * Parsea la tabla de ListaEmsEscalador.jsp (fila EMS/Edo./F-H Ini./.../EFA/Edo./
 * F-H Ini.). SIN USO desde 2026-10-01: el flujo directo ya no obtiene el estatus.
 * Se conserva como referencia para reactivarlo (ver encabezado del archivo).
 */
function parseResultFrame(folio: string, html: string): MantoEstatusResult {
  // "Total de Registros: 0" → el folio no tiene fila (equivalente a no encontrado,
  // aunque Manto no haya mandado a Error.jsp).
  if (/Total de Registros:\s*<span[^>]*>\s*0\s*<\/span>/i.test(html)) {
    return { folio, found: false, error: "Sin registros para este folio en Manto" };
  }

  // Columnas de la fila de datos (clase otfooter2/otfooter3): No., EMS, Edo.,
  // F/H Ini., Referencia, Empresa, Punta A, Punta B, Efa, Edo., F/H Ini., OIN's, OGE's.
  const rowMatch = html.match(/<tr class="otfooter\d">([\s\S]*?)<\/tr>/);
  if (!rowMatch) {
    return { folio, found: false, error: "No se pudo interpretar la respuesta de Manto (tabla sin filas)" };
  }

  const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
  );
  // Índices 0-based: 0=No. 1=EMS 2=Edo(EMS) 3=F/H Ini(EMS) 4=Referencia 5=Empresa
  // 6=Punta A 7=Punta B 8=Efa 9=Edo(EFA) 10=F/H Ini(EFA) 11=OIN's 12=OGE's
  const estadoEms = cells[2] || undefined;
  const fechaEstadoEms = cells[3] || undefined;
  const estadoEfa = cells[9] || undefined;
  const fechaEstadoEfa = cells[10] || undefined;

  if (!estadoEms && !estadoEfa) {
    return { folio, found: false, error: "Fila de resultado sin columnas de estado reconocibles" };
  }

  return { folio, found: true, estadoEms, estadoEfa, fechaEstadoEfa, fechaEstadoEms };
}

/**
 * Consulta el estatus de varios folios en UNA sola sesión de Manto (un solo
 * login). Secuencial a propósito — no queremos varias pestañas/paralelismo
 * golpeando un sistema ajeno al que solo entramos bajo demanda.
 */
export async function consultarEstatusFolios(
  folios: string[],
  /**
   * Se invoca con cada resultado en cuanto Manto lo devuelve, para que el
   * llamador lo persista sin esperar a que termine la corrida completa (con
   * ~45 folios a ~18 s cada uno, son ~13 min). Si lanza, se registra y la
   * corrida continúa: perder un guardado no debe abortar el resto.
   */
  onResult?: (r: MantoEstatusResult) => Promise<void>,
): Promise<MantoEstatusResult[]> {
  const folioLimpios = [...new Set(folios.map((f) => f.trim()).filter(Boolean))];
  if (folioLimpios.length === 0) return [];

  const session = await openMantoSession();
  const results: MantoEstatusResult[] = [];

  // Portal caído se detecta por DOS señales inequívocas, NO por acumular fallos:
  //   1. Login fallido / frameset que no monta → en openMantoSession (arriba).
  //   2. Huella de Oracle/servlet en el cuerpo de una respuesta → aborta aquí.
  // Un HTTP 500 por folio NO es una de ellas: Manto devuelve 500 también para
  // folios purgados (el JSP revienta en vez de negar limpio), y una tanda real
  // trae folios viejos mezclados. Contar esos 500 hacia un umbral abortaría la
  // corrida por folios viejos, dejando sin actualizar los reales que siguen.
  // Por eso cada 500 se salta y se sigue — ver reporte 2026-10-01.

  const reportar = async (r: MantoEstatusResult) => {
    results.push(r);
    if (onResult) {
      await onResult(r).catch((e) =>
        logger.error("Manto: fallo al reportar resultado parcial", { folio: r.folio, err: String(e) }),
      );
    }
  };

  try {
    for (const folio of folioLimpios) {
      try {
        const r = await consultarFolio(session.page, folio);
        logger.info("Manto: folio consultado", r);
        await reportar(r);
      } catch (err) {
        // Portal caído inequívoco (huella Oracle/servlet): aborta la corrida.
        if (err instanceof PortalFueraDeGestionError) throw err;

        // HTTP 500 = folio purgado: se salta y se SIGUE siempre, sin contar
        // hacia ningún umbral de aborto.
        if (err instanceof FolioHttp500Error) {
          logger.info("Manto: folio no encontrado (HTTP 500 — folio purgado)", { folio });
          await reportar({
            folio,
            found: false,
            error: "No encontrado en Manto (HTTP 500 — folio purgado)",
          });
          continue;
        }

        // Error inesperado de ESTE folio (ej. timeout de red): se registra y se
        // sigue; no debe tumbar el resto de la tanda.
        logger.error("Manto: error consultando folio", { folio, err: String(err) });
        await reportar({ folio, found: false, error: String(err) });
      }
    }
  } finally {
    await session.close();
  }
  return results;
}
