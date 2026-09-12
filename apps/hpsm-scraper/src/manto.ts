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
        const base = parseResultFrame(folio, html);
        if (!base.found) return base;
        // Notas del EFA: petición aparte reusando la sesión ya autenticada. Si
        // falla, se devuelve el estatus igual — las notas son un extra para el
        // formato EDC, no deben tumbar la consulta del folio.
        const notasEfa = await descargarNotasEfa(page, folio);
        return { ...base, notasEfa };
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

// ─────────────────────────────────────────────────────────────────────────────
// NOTAS DEL EFA (VentanaZoom.jsp?tipo=EFA) — alimentan la línea "Estatus:" del
// formato EDC.
//
// Manto guarda TODO el historial del folio en un solo <textarea> sin
// estructura: observaciones del contacto, diagnósticos, reasignaciones de
// técnico y volcados completos de pruebas GPON, concatenados y sin orden
// cronológico fiable. Copiar el textarea entero no sirve: en folios reales son
// 2000+ caracteres, la mayoría datos de equipo (potencias ópticas, VLANs,
// tráfico por interfaz) que no aportan al aviso de WhatsApp.
//
// Se arma un resumen con lo que el equipo sí reporta, en este orden:
//   1. Observaciones del Contacto (falla, cliente, caso, contacto, horarios)
//   2. Última línea RMA:        — quién atiende / última reasignación
//   3. DIAGNOSTICO:             — solo si trae valor en la misma línea
//   4. PISA:<dígitos>           — solo folios PISA reales
// ─────────────────────────────────────────────────────────────────────────────

const MARCA_OBSERVACIONES = "******** Observaciones del Contacto ********";

// Inicio del bloque técnico: corta las Observaciones. "CASxxx :" son las
// entidades (CASPUE, CASGDL...) que preceden a una reasignación automática.
const INICIO_BLOQUE_TECNICO =
  /^(RMA\s*:|DIAGNOSTICO\s*:|RESULTADOS DE LA PRUEBA|Re-Asignaci|CAS[A-Z]{2,4}\s*:|Informaci.n del Equipo|Consultar\b|Id Contrato\b)/i;

// Líneas de las Observaciones que NO van al EDC porque ya están arriba en el
// propio formato (Cliente, Incidente) o son del área que reporta, no del sitio:
// el EDC ya trae "Cliente:" y "*Incidente crítico*:" en sus primeras líneas.
const OBSERVACION_REDUNDANTE =
  /^(CLIENTE\s*:|CASO(\s+UNINET)?\s*:|INCIDENTE\s*:|IDS\s+CARE\s*:|TELEFONO\s*:|REPORTA\s*:)/i;

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
  const lineas = texto.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  if (lineas.length === 0) return undefined;

  // 1. Observaciones: desde la ÚLTIMA marca (es la vigente cuando hay varias),
  //    hasta que empieza el bloque técnico.
  const idxMarca = texto.lastIndexOf(MARCA_OBSERVACIONES);
  const desdeMarca = idxMarca >= 0 ? texto.slice(idxMarca + MARCA_OBSERVACIONES.length) : texto;
  const observaciones: string[] = [];
  for (const l of desdeMarca.split(/[\r\n]+/).map((x) => x.trim()).filter(Boolean)) {
    if (INICIO_BLOQUE_TECNICO.test(l)) break;
    if (OBSERVACION_REDUNDANTE.test(l)) continue; // ya va arriba en el EDC
    observaciones.push(l);
  }

  // El contacto de sitio se mueve al FINAL (después de RMA/DIAGNOSTICO/PISA):
  // es dato de referencia, no el avance del folio. Arrastra solo las líneas que
  // son parte del mismo dato (teléfono, horario, notas de acceso) — NO los
  // avisos "## ... ###", que van con la descripción de la falla.
  const contacto: string[] = [];
  const idxContacto = observaciones.findIndex((l) => /^(CONTACTO|RESPONSABLE EN SITIO)\s*:/i.test(l));
  if (idxContacto >= 0) {
    let fin = idxContacto + 1;
    while (
      fin < observaciones.length &&
      /^(tel\.?|tel[ée]fono|cel\.?|horario|acceso|acc\b|nota)\b/i.test(observaciones[fin])
    ) {
      fin++;
    }
    contacto.push(...observaciones.splice(idxContacto, fin - idxContacto));
  }

  const partes = [...observaciones];

  // 2. Última RMA: la más reciente (reasignación o quién atiende; ambas traen fecha).
  const rma = lineas.filter((l) => /^RMA\s*:/i.test(l)).pop();
  if (rma) partes.push(rma);

  // 3. DIAGNOSTICO: solo si trae valor pegado en la misma línea. Cuando Manto lo
  //    deja vacío, el texto real queda en la línea siguiente mezclado con el
  //    volcado técnico — se omite antes que arriesgar arrastrar ruido.
  const diag = lineas
    .filter((l) => /^DIAGNOSTICO\s*:/i.test(l) && l.replace(/^DIAGNOSTICO\s*:/i, "").trim().length > 0)
    .pop();
  if (diag) partes.push(diag);

  // 4. PISA: exige dígitos — descarta cosas como "FinPISA:  9/05/2026" (una
  //    fecha) y "Reporte exitoso en PISA:" (etiqueta sin folio).
  const pisaMatch = [...texto.matchAll(/\bPISA\s*:\s*(\d{4,})\b/gi)].pop();
  if (pisaMatch) partes.push(`PISA: ${pisaMatch[1]}`);

  // 5. Contacto de sitio, al final.
  partes.push(...contacto);

  const out = partes.join("\n").trim();
  return out.length > 0 ? out : undefined;
}

/**
 * Descarga VentanaZoom.jsp del EFA (la ventana de notas) reusando las cookies
 * de la sesión abierta, y devuelve el resumen. Nunca lanza: si el portal no
 * responde o el HTML cambia, el folio conserva su estatus y se queda sin notas.
 */
async function descargarNotasEfa(page: Page, folio: string): Promise<string | undefined> {
  try {
    // Se deriva del host configurado (no fijo) para seguir a config.manto.url.
    const origen = new URL(config.manto.url).origin;
    const res = await page.context().request.get(
      `${origen}/manto/jsp/VentanaZoom.jsp?tipo=EFA&folio=${folio}`,
      { timeout: 20_000 },
    );
    if (!res.ok()) return undefined;
    // Los acentos llegan como "?" ("S?BADO", "Asignaci?n"): NO es un problema
    // de decodificación de aquí — Manto ya tiene el signo de interrogación
    // guardado en sus datos (se comprobó leyendo el buffer como iso-8859-1,
    // que devuelve lo mismo). La letra original no es recuperable.
    return extraerNotasEfa(await res.text());
  } catch (e) {
    logger.warn("Manto: no se pudieron leer las notas del EFA", { folio, err: String(e) });
    return undefined;
  }
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
