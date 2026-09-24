import type { Frame, Page } from "playwright";
import { config } from "./config.js";
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

const FORM_TIMEOUT_MS = 45_000;
const LIST_TIMEOUT_MS = 30_000;
// Fila de datos del grid: el <tr> que trae la celda de fecha (el de cabecera no).
const FILA_ACTIVIDAD = 'tr:has(> td[class*="column_datestamp"])';

function deepLink(file: string, im: string): string {
  const u = new URL("/sm/index.do", config.hpsm.url);
  u.searchParams.set("lang", "en");
  u.searchParams.set("ctx", "docEngine");
  u.searchParams.set("file", file);
  u.searchParams.set("query", `number="${im}"`);
  u.searchParams.set("action", "");
  u.searchParams.set("title", im);
  return u.href;
}

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

async function leerEstatus(page: Page, im: string): Promise<{ found: boolean; status: string }> {
  await page.goto(deepLink("probsummary", im), { waitUntil: "domcontentloaded", timeout: 30_000 });
  // instance/number existe en los tres casos: abierto, cerrado (form de solo
  // lectura) y no encontrado (form de búsqueda).
  const detail = await waitForFrame(
    page,
    async (f) =>
      f.url().includes("detail.do") && (await f.locator('input[name="instance/number"]').count()) > 0,
    FORM_TIMEOUT_MS,
  );
  if (!detail) throw new Error("el formulario del incidente no cargó");

  const numero = (await detail.locator('input[name="instance/number"]').first().inputValue().catch(() => "")).trim();
  if (numero.toUpperCase() !== im) return { found: false, status: "" };

  // En un incidente cerrado el input de Status NO tiene name (solo lectura):
  // se localiza por su <label> "Status:" (excluye "KPI Status"). En abiertos
  // es instance/problem.status.
  // Sin funciones con nombre dentro de evaluate: tsx inyecta __name, que no
  // existe en el navegador.
  const status = await detail.evaluate(() => {
    for (const lbl of Array.from(document.querySelectorAll("label"))) {
      if (!/^Status\b/i.test((lbl.textContent ?? "").trim())) continue;
      const id = lbl.getAttribute("for");
      const el = id ? (document.getElementById(id) as HTMLInputElement | null) : null;
      if (el && typeof el.value === "string" && el.value.trim()) return el.value.trim();
    }
    const byName = document.querySelector<HTMLInputElement>('input[name="instance/problem.status"]');
    return byName?.value.trim() ?? "";
  });
  return { found: true, status };
}

async function leerActividades(page: Page, im: string): Promise<ImActividad[]> {
  await page.goto(deepLink("activity", im), { waitUntil: "domcontentloaded", timeout: 30_000 });
  const list = await waitForFrame(
    page,
    async (f) => f.url().includes("list.do") && (await f.locator(FILA_ACTIVIDAD).count()) > 0,
    LIST_TIMEOUT_MS,
  );
  if (!list) return []; // sin bitácora (o no cargó): se reporta sin actividades

  const filas = await list.evaluate(
    ({ max, selector, campos }) =>
      Array.from(document.querySelectorAll(selector))
        .slice(0, max)
        .map((row) =>
          campos.map((campo) =>
            (row.querySelector(`td[class*="column_${campo}"] .x-grid3-cell-inner`)?.textContent ?? "")
              .replace(/\s+/g, " ")
              .trim(),
          ),
        ),
    { max: MAX_ACTIVIDADES, selector: FILA_ACTIVIDAD, campos: ["datestamp", "operator", "type", "description"] },
  );
  return filas.map(([fecha = "", operador = "", tipo = "", descripcion = ""]) => ({ fecha, operador, tipo, descripcion }));
}

/** Consulta un IM. No lanza: los errores quedan en `error` del resultado. */
export async function consultarIncidente(page: Page, im: string): Promise<ImEstatusResult> {
  try {
    const { found, status } = await leerEstatus(page, im);
    if (!found) return { im, found: false };

    const cerrado = status.toUpperCase() === "CLOSED";
    const actividades = cerrado ? [] : await leerActividades(page, im);
    logger.info(`IM ${im}: ${status} (${actividades.length} actividades)`);
    return { im, found: true, status, cerrado, actividades };
  } catch (e) {
    const error = (e as Error).message;
    logger.warn(`IM ${im}: error consultando`, { error });
    return { im, found: false, error };
  }
}
