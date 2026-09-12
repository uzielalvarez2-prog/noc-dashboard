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
 *  2. Dentro del frame MarcoMenu.jsp vive form2 (búsqueda rápida):
 *     - form2.buscar = folio (numérico)
 *     - form2.busqueda_por = "efa"  (el folio SISA es el "EFA" de Manto)
 *     - target del form: BusEmsSer.jsp → si existe, redirige a
 *       BusquedaEfa.jsp?efa=N, que carga un iframe hijo
 *       ListaEmsEscalador.jsp?origen=efa&folioefa=N con la fila de resultado.
 *     - Si el folio no existe (purgado/muy viejo), Manto navega a
 *       jsp/Error.jsp?mensaje=No%20Existe%20el%20EFA%20con%20el%20folio%20N
 *  3. La fila de resultado trae columnas EMS/Edo./F-H Ini. y EFA/Edo./F-H Ini.
 *     (cuando EMS y EFA son el mismo folio, ambos números coinciden).
 *
 * NO se scrapea la bitácora (VentanaZoom) ni los OIN/OGE — decisión explícita
 * del usuario: solo estatus (Edo. EMS/EFA) + fecha.
 */

export interface MantoEstatusResult {
  folio: string;
  found: boolean;
  estadoEms?: string;
  estadoEfa?: string;
  fechaEstadoEfa?: string; // tal cual la reporta Manto, ej. "11/09/2026 18:34:56"
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

  // El frameset tarda en montar todos sus frames. Sin esperar a MarcoMenu (el
  // que tiene el form de búsqueda), la PRIMERA consulta se va en timeout.
  const menuDeadline = Date.now() + 20_000;
  let menuListo = false;
  while (Date.now() < menuDeadline) {
    const menu = page.frames().find((f) => f.url().includes("MarcoMenu"));
    // No basta con que el frame exista: su form2 debe estar parseado.
    if (menu) {
      const tieneForm = await menu
        .evaluate(() => Boolean(document.forms.namedItem("form2")))
        .catch(() => false);
      if (tieneForm) {
        menuListo = true;
        break;
      }
    }
    await page.waitForTimeout(500);
  }
  if (!menuListo) {
    // Login aceptado pero el frameset nunca montó: típico de portal a medio
    // caer (el servlet de acceso responde, los JSP de datos no).
    const huella = detectarPortalCaido(await page.content());
    await browser.close();
    throw new PortalFueraDeGestionError(
      huella ?? "el menú de búsqueda no cargó tras el login",
    );
  }

  return {
    browser,
    page,
    close: async () => {
      await browser.close();
    },
  };
}

/** Consulta el estatus de UN folio en Manto (busqueda_por=efa). Reutiliza la página/sesión dada. */
async function consultarFolio(page: Page, folio: string): Promise<MantoEstatusResult> {
  const menuFrame = page.frames().find((f) => f.url().includes("MarcoMenu"));
  if (!menuFrame) {
    return { folio, found: false, error: "No se encontró el frame de menú (MarcoMenu.jsp) — sesión inválida" };
  }

  await menuFrame.evaluate(({ buscar }) => {
    const f = document.forms.namedItem("form2") as HTMLFormElement | null;
    if (!f) throw new Error("form2 no encontrado en MarcoMenu");
    (f.elements.namedItem("buscar") as HTMLInputElement).value = buscar;
    (f.elements.namedItem("busqueda_por") as HTMLInputElement).value = "efa";
    f.submit();
  }, { buscar: folio });

  // Esperar el resultado de ESTE folio. Clave: los frames del folio anterior
  // siguen montados mientras Manto responde, así que se exige que la URL del
  // frame corresponda al folio consultado — si no, se leería el estado del
  // folio previo y se guardaría como si fuera de este (dato incorrecto
  // silencioso, peor que un error).
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    // "No Existe el EFA con el folio N" es una respuesta LEGÍTIMA (folio
    // purgado), no un portal caído: se acepta tal cual.
    const errorFrame = page
      .frames()
      .find((f) => f.url().includes("Error.jsp") && f.url().includes(`folio%20${folio}`));
    if (errorFrame) {
      const url = new URL(errorFrame.url());
      const mensaje = url.searchParams.get("mensaje") ?? "Folio no encontrado en Manto";
      return { folio, found: false, error: mensaje };
    }
    const resultFrame = page.frames().find((f) => f.url().includes(`folioefa=${folio}`));
    if (resultFrame) {
      const html = await resultFrame.content();
      // Un error de SQL/servidor en el JSP de datos = portal caído: aborta la
      // corrida completa en vez de marcar este folio como no encontrado.
      const huella = detectarPortalCaido(html);
      if (huella) throw new PortalFueraDeGestionError(huella);
      // El iframe puede existir con la URL nueva pero aún sin el HTML de la
      // tabla; si no hay tabla todavía, se sigue esperando.
      if (/Total de Registros/i.test(html)) {
        return parseResultFrame(folio, html);
      }
    }
    await page.waitForTimeout(500);
  }

  // Timeout: puede ser lentitud puntual o portal caído. Se revisa el documento
  // completo por si quedó una huella de error de servidor.
  const huellaFinal = detectarPortalCaido(await page.content().catch(() => ""));
  if (huellaFinal) throw new PortalFueraDeGestionError(huellaFinal);

  return { folio, found: false, error: "Timeout esperando respuesta de Manto" };
}

/** Parsea la tabla de ListaEmsEscalador.jsp (fila EMS/Edo./F-H Ini./.../EFA/Edo./F-H Ini.). */
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
  const estadoEfa = cells[9] || undefined;
  const fechaEstadoEfa = cells[10] || undefined;

  if (!estadoEms && !estadoEfa) {
    return { folio, found: false, error: "Fila de resultado sin columnas de estado reconocibles" };
  }

  return { folio, found: true, estadoEms, estadoEfa, fechaEstadoEfa };
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
  // Varios timeouts seguidos sin una sola respuesta útil = el portal dejó de
  // responder a media corrida. Se corta en vez de gastar ~18 s por folio
  // restante contra un servidor caído.
  const MAX_TIMEOUTS_SEGUIDOS = 3;
  let timeoutsSeguidos = 0;

  try {
    for (const folio of folioLimpios) {
      try {
        const r = await consultarFolio(session.page, folio);
        results.push(r);
        logger.info("Manto: folio consultado", r);

        if (onResult) {
          await onResult(r).catch((e) =>
            logger.error("Manto: fallo al reportar resultado parcial", { folio, err: String(e) }),
          );
        }

        if (!r.found && /Timeout/i.test(r.error ?? "")) {
          timeoutsSeguidos++;
          if (timeoutsSeguidos >= MAX_TIMEOUTS_SEGUIDOS) {
            throw new PortalFueraDeGestionError(
              `${timeoutsSeguidos} consultas seguidas sin respuesta`,
            );
          }
        } else {
          timeoutsSeguidos = 0;
        }
      } catch (err) {
        // Portal caído: se propaga para abortar la corrida completa. El
        // servidor HTTP lo traduce a un mensaje único para el dashboard.
        if (err instanceof PortalFueraDeGestionError) throw err;
        logger.error("Manto: error consultando folio", { folio, err: String(err) });
        results.push({ folio, found: false, error: String(err) });
      }
    }
  } finally {
    await session.close();
  }
  return results;
}
