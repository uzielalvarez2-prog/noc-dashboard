import type { Frame, Page } from "playwright";
import { logger } from "./logger.js";

/**
 * Consulta de un incidente individual en HPSM por su número (IM). Se usan los
 * deep links del cliente web (`ctx=docEngine`), que abren el registro sin
 * navegar menús. Estructura confirmada a mano (exploración 2026-09-23):
 *
 *  1. file=probsummary&query=number="IM…" → frame detail.do con el form del
 *     incidente. Estatus en input[name="instance/problem.status"] (abiertos) o
 *     en el input sin name de la etiqueta "Status:" (cerrados, solo lectura).
 *     Si el IM no existe, HPSM cae al form de búsqueda con
 *     input[name="instance/number"] vacío.
 *  2. file=activity&query=number="IM…" → frame list.do con la bitácora como
 *     grid ExtJS, ordenada de la más reciente a la más vieja. Cada celda trae
 *     una clase column_<campo>: datestamp, operator, type, description_1_.
 *     OJO: description_1_ es la PRIMERA línea de la descripción (en HPSM es un
 *     arreglo); notas multilínea salen recortadas a su primer renglón.
 */

export interface ImActividad {
  fecha: string; // tal cual HPSM, "YY/MM/DD HH:mm:ss"
  operador: string;
  tipo: string;
  descripcion: string;
}

export interface ImEstatusResult {
  im: string;
  found: boolean;
  status?: string;
  cerrado?: boolean;
  actividades?: ImActividad[];
  error?: string;
}

export const MAX_ACTIVIDADES = 3;

/** Formato aceptado de IM — el valor se inyecta en una query de HPSM. */
export const IM_REGEX = /^IM[A-Z0-9]{4,20}$/;

const LIST_TIMEOUT_MS = 30_000;

/** Sondea los frames hasta que alguno cumpla `test`, o se acabe el tiempo. */
async function waitForFrame(
  page: Page,
  test: (f: Frame) => Promise<boolean>,
  timeoutMs: number,
): Promise<Frame | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      if (await test(f).catch(() => false)) return f;
    }
    await page.waitForTimeout(1_000);
  }
  return undefined;
}

const BUSCADOR_NAV_TIMEOUT_MS = 20_000;
const BUSCADOR_FORM_TIMEOUT_MS = 60_000;

/** Frame del form de búsqueda (QBE) si está abierto: el que tiene instance/number visible. */
async function frameBuscadorAbierto(page: Page): Promise<Frame | undefined> {
  for (const f of page.frames()) {
    const loc = f.locator('input[name="instance/number"]').first();
    if (
      (await loc.count().catch(() => 0)) > 0 &&
      (await loc.isVisible().catch(() => false)) &&
      (await loc.isEditable().catch(() => false))
    ) {
      return f;
    }
  }
  return undefined;
}

/** Navega el menú Incident Management → Search Incidents hasta dejar el QBE listo. */
async function abrirBuscadorDesdeMenu(page: Page): Promise<Frame> {
  await page.locator(".ext-el-mask").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});

  // Clickear "Incident Management" es un TOGGLE: si el submenú ya estaba
  // expandido (p.ej. tras abrir un IM previo), un click lo COLAPSA y oculta
  // "Search Incidents". Se reintenta hasta que "Search Incidents" quede visible.
  const incMgmt = page.locator("text=Incident Management").first();
  await incMgmt.waitFor({ state: "visible", timeout: 15_000 });
  const searchInc = page.locator("text=Search Incidents").first();

  let visible = await searchInc.isVisible().catch(() => false);
  for (let i = 0; i < 4 && !visible; i++) {
    await incMgmt.click({ timeout: 15_000 }).catch(() => {});
    visible = await searchInc
      .waitFor({ state: "visible", timeout: 6_000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!visible) throw new Error('No se pudo dejar visible "Search Incidents" en el menú');

  const nuevoFrame = page.waitForEvent("frameattached", { timeout: BUSCADOR_NAV_TIMEOUT_MS }).catch(() => null);
  await searchInc.click({ timeout: 10_000 });
  await nuevoFrame;

  // Sondear hasta que el campo instance/number del QBE esté visible y editable.
  // Tras cerrar un IM el DOM tarda en estabilizarse, así que se da margen amplio.
  const deadline = Date.now() + BUSCADOR_FORM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const qbe = await frameBuscadorAbierto(page);
    if (qbe) return qbe;
    await page.waitForTimeout(1_000);
  }
  throw new Error("No se abrió el form de búsqueda (instance/number)");
}

/**
 * Abre UN incidente por su folio vía el BUSCADOR (Incident Management → Search
 * Incidents → teclear número → Search), que reemplazó a los deep links
 * `ctx=docEngine` desde que HPSM endureció querysecurity (2026-11-11: "Invalid
 * query hash in URL"). Cae directo en `detail.do` (match único) — verificado con
 * el reconocimiento de explorar-buscador.ts.
 *
 * OPTIMIZACIÓN: reusa el buscador si ya está abierto (solo limpia el campo y
 * teclea el siguiente folio); si el estado se perdió, re-navega el menú solo.
 *
 * Devuelve el frame `detail.do`. Lanza si no logra abrir el incidente; el valor
 * de `instance/number` del detalle lo valida el llamador (vacío = no existe).
 */
export async function abrirIncidentePorBuscador(page: Page, im: string): Promise<Frame> {
  // Se intenta 2 veces: el 1er intento puede reusar el buscador que quedó de un
  // IM previo; si falla (típico tras cerrar un IM: el DOM queda en un estado
  // intermedio que confunde la detección del QBE), el 2º limpia pestañas y
  // navega el menú DESDE CERO. Así el cierre masivo deja de fallar en IMs
  // alternados.
  let ultimoError = "";
  for (let intento = 1; intento <= 2; intento++) {
    const forzarMenu = intento > 1;
    try {
      return await abrirUnaVez(page, im, forzarMenu);
    } catch (e) {
      ultimoError = (e as Error).message;
      logger.warn(`abrir ${im}: intento ${intento} falló (${ultimoError}); ${intento < 2 ? "reintentando con menú limpio" : "sin más reintentos"}`);
      // Limpiar el estado antes de reintentar: cerrar pestañas de aplicación.
      await cerrarPestanas(page).catch(() => {});
      await page.waitForTimeout(1_500);
    }
  }
  throw new Error(`No se pudo abrir ${im} por el buscador tras 2 intentos: ${ultimoError}`);
}

/** Un intento de apertura. `forzarMenu` ignora el buscador reusable y navega el menú. */
async function abrirUnaVez(page: Page, im: string, forzarMenu: boolean): Promise<Frame> {
  // 1. Conseguir el QBE: reusar el abierto (salvo que se fuerce el menú).
  let qbe = forzarMenu ? undefined : await frameBuscadorAbierto(page);
  if (!qbe) qbe = await abrirBuscadorDesdeMenu(page);

  // 2. Teclear el folio (limpiar primero, por si quedó texto del IM anterior).
  const campo = qbe.locator('input[name="instance/number"]').first();
  await campo.fill("", { force: true, timeout: 5_000 }).catch(() => {});
  await campo.fill(im, { force: true, timeout: 5_000 });

  // 3. Disparar Search (botón exacto, en el frame del QBE o en el chrome index.do).
  let clickeado = false;
  const frames = [qbe, ...page.frames().filter((f) => f !== qbe)];
  for (const f of frames) {
    const btn = f.locator(':text-is("Search")').first();
    if ((await btn.count().catch(() => 0)) > 0) {
      await btn.evaluate((el) => (el as HTMLElement).click());
      clickeado = true;
      break;
    }
  }
  if (!clickeado) throw new Error('No se encontró el botón "Search" del buscador');

  // 4. Esperar el detalle con el folio pedido (no uno residual de otro IM).
  const detail = await waitForFrame(
    page,
    async (f) => {
      if (!f.url().includes("detail.do")) return false;
      const loc = f.locator('input[name="instance/number"]').first();
      return (await loc.count().catch(() => 0)) > 0;
    },
    BUSCADOR_FORM_TIMEOUT_MS,
  );
  if (!detail) throw new Error("El buscador no abrió el detalle del incidente (detail.do)");
  return detail;
}

/** Lee número + status del detalle YA abierto (no navega). */
async function leerEstatus(
  page: Page,
  detail: Frame,
  im: string,
): Promise<{ found: boolean; status: string }> {
  await assertSinTopeDePestanas(page);
  // El detalle carga diferido: el frame existe pero los valores (number, status)
  // tardan en poblarse, sobre todo en un servidor lento (Railway). Leer de
  // inmediato daba un falso "no encontrado" / status vacío. Se espera a que
  // instance/number se pueble (hasta 12 s).
  let numero = "";
  const numDeadline = Date.now() + 12_000;
  while (Date.now() < numDeadline) {
    numero = (await detail.locator('input[name="instance/number"]').first().inputValue().catch(() => "")).trim();
    if (numero) break;
    await page.waitForTimeout(1_000);
  }
  // Vacío = HPSM cayó al form de búsqueda: el IM no existe. Otro número = HPSM
  // mostró un registro que no es el pedido: error, NO "no encontrado".
  if (!numero) return { found: false, status: "" };
  if (numero.toUpperCase() !== im) throw new Error(`HPSM mostró ${numero} en lugar de ${im}`);

  // Status: igual que number, se pueble diferido. Se sondea hasta 10 s. En un IM
  // abierto vive en instance/problem.status (puede ser el input o un hidden
  // X25Hidden con el valor); en uno cerrado el campo es de solo lectura y se
  // localiza por su <label> "Status:" (excluye "KPI Status").
  // Sin funciones con nombre dentro de evaluate: tsx inyecta __name, que no
  // existe en el navegador.
  let status = "";
  const stDeadline = Date.now() + 10_000;
  while (Date.now() < stDeadline) {
    status = await detail.evaluate(() => {
      // 1) Por name instance/problem.status (input visible o hidden), cualquiera con valor.
      for (const el of Array.from(
        document.querySelectorAll<HTMLInputElement>('[name="instance/problem.status"]'),
      )) {
        if (typeof el.value === "string" && el.value.trim()) return el.value.trim();
        const t = (el.textContent ?? "").trim();
        if (t) return t;
      }
      // 2) Por label "Status:" → control al que apunta.
      for (const lbl of Array.from(document.querySelectorAll("label"))) {
        if (!/^Status\b/i.test((lbl.textContent ?? "").trim())) continue;
        const id = lbl.getAttribute("for");
        const el = id ? (document.getElementById(id) as HTMLInputElement | null) : null;
        if (el && typeof el.value === "string" && el.value.trim()) return el.value.trim();
      }
      return "";
    });
    if (status) break;
    await page.waitForTimeout(1_000);
  }
  return { found: true, status };
}

/**
 * Lee la bitácora ("Past Activities") del incidente. Desde que murió el deep
 * link `file=activity`, la bitácora se lee del GRID embebido en el propio
 * detalle (detail.do), que es una "Detail Table" de HPSM: cada fila K trae spans
 *   references/model[@id='number.vj']/instance[K]/{datestamp,type,operator,description}
 * ordenadas de la más reciente (K=1) a la más vieja. Se ancla al modelo
 * `number.vj` para NO mezclar con las tablas de Tasks (parent.inc.*.vj).
 * Confirmado con el reconocimiento de explorar-bitacora.ts + volcado HTML
 * (2026-11-11). Lee del detalle YA abierto (no navega).
 */
async function leerActividades(detail: Frame): Promise<ImActividad[]> {
  // Esperar a que el grid de actividades poble (al menos la fecha de la 1ª fila).
  const refBase = `references/model[@id='number.vj']/instance`;
  await detail
    .locator(`[name="${refBase}[1]/datestamp"]`)
    .first()
    .waitFor({ state: "attached", timeout: LIST_TIMEOUT_MS })
    .catch(() => {}); // sin bitácora o no cargó → se devuelve []

  // OJO: dentro de evaluate NO se pueden declarar funciones con nombre (tsx las
  // instrumenta con __name, que no existe en el navegador → ReferenceError). Se
  // usa SOLO código inline, sin funciones nombradas ni arrow asignadas a const.
  // La descripción cuelga de un sufijo distinto: en HPSM es un arreglo, y la
  // PRIMERA línea vive en `description/description[1]` (no en `description` a
  // secas). Las notas multilínea salen recortadas a su primer renglón.
  const filas = await detail.evaluate(
    ({ max, refBase, campos }) => {
      const out: string[][] = [];
      for (let k = 1; k <= max; k++) {
        const fila = campos.map((sufijo) => {
          const el = document.querySelector(`[name="${refBase}[${k}]/${sufijo}"]`);
          return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
        });
        if (!fila[0]) break; // sin fecha = no hay más filas
        out.push(fila);
      }
      return out;
    },
    {
      max: MAX_ACTIVIDADES,
      refBase,
      campos: ["datestamp", "operator", "type", "description/description[1]"],
    },
  );

  return filas.map(([fecha = "", operador = "", tipo = "", descripcion = ""]) => ({
    fecha,
    operador,
    tipo,
    descripcion,
  }));
}

/**
 * Cada deep link abre una pestaña NUEVA del lado del servidor de HPSM, que
 * sobrevive al page.goto. HPSM tiene tope ("Maximum number of application tabs
 * exceeded"): con 2 pestañas por IM, sin cerrarlas, la consulta se rompía en
 * el 5º IM. Se cierran con su × (solo las closable; To Do Queue no lo es).
 */
async function cerrarPestanas(page: Page): Promise<void> {
  const main = page.mainFrame();
  const closes = main.locator("li.x-tab-strip-closable a.x-tab-strip-close");
  for (let i = 0; i < 6; i++) {
    const n = await closes.count().catch(() => 0);
    if (n === 0) return;
    await closes.last().evaluate((el) => (el as HTMLElement).click()).catch(() => {});
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline && (await closes.count().catch(() => 0)) >= n) {
      await page.waitForTimeout(300);
    }
  }
  const quedan = await closes.count().catch(() => 0);
  if (quedan > 0) logger.warn(`Quedaron ${quedan} pestañas de HPSM sin cerrar`);
}

async function assertSinTopeDePestanas(page: Page): Promise<void> {
  for (const f of page.frames()) {
    const tope = await f
      .locator("text=Maximum number of application tabs")
      .count()
      .catch(() => 0);
    if (tope > 0) throw new Error("HPSM: tope de pestañas abiertas alcanzado");
  }
}

/** Consulta un IM. No lanza: los errores quedan en `error` del resultado. */
export async function consultarIncidente(page: Page, im: string): Promise<ImEstatusResult> {
  try {
    // Abrir el IM UNA sola vez (los deep links ctx=docEngine ya no sirven) y leer
    // status + bitácora del mismo detalle, sin re-navegar el menú por cada uno.
    const detail = await abrirIncidentePorBuscador(page, im);
    const { found, status } = await leerEstatus(page, detail, im);
    if (!found) {
      logger.info(`IM ${im}: no encontrado`);
      return { im, found: false };
    }

    const cerrado = status.toUpperCase() === "CLOSED";
    const actividades = cerrado ? [] : await leerActividades(detail);
    logger.info(`IM ${im}: ${status} (${actividades.length} actividades)`);
    return { im, found: true, status, cerrado, actividades };
  } catch (e) {
    const error = (e as Error).message;
    logger.warn(`IM ${im}: error consultando`, { error });
    return { im, found: false, error };
  } finally {
    await cerrarPestanas(page);
  }
}
