import type { Frame, Page } from "playwright";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { IM_REGEX } from "./hpsm-incident.js";

/**
 * Cierre de un incidente en HPSM aplicando un TEMPLATE (reproduce el flujo
 * manual del NOC, verificado a mano el 2026-10-31 con el reconocimiento de
 * explorar-cierre.ts):
 *
 *   1-3. Abrir el incidente       → deep link probsummary (en vez de Search
 *                                    Incident → pegar IM → lupa; mismo efecto,
 *                                    más robusto, ya probado en hpsm-incident.ts).
 *   4.   Apply Template           → botón de la toolbar (x-btn).
 *   5.   Elegir template          → wizard "Select Incident Template": una tabla
 *                                    de links <a>; se clickea el que su texto ==
 *                                    el template pedido (match exacto, trim).
 *   6.   Close (X)                → GUARDA/CIERRA el incidente. IRREVERSIBLE.
 *   7.   Cancel (X)               → vuelve para el siguiente IM (lo hace el job
 *                                    al navegar al próximo deep link).
 *
 * El `modo` controla hasta dónde llega:
 *   - "verificar": pasos 1-4 + comprobar que el template existe en el wizard,
 *                  luego Cancel. NO aplica, NO cierra. Cero cambios en HPSM.
 *   - "aplicar":   pasos 1-5 (aplica el template) y se detiene. NO cierra.
 *   - "cerrar":    pasos 1-6 completos. Cierra de verdad.
 */

export type ModoCierre = "verificar" | "aplicar" | "cerrar";

export interface CierreResult {
  im: string;
  template: string;
  modo: ModoCierre;
  ok: boolean;
  /** Qué llegó a hacer realmente. */
  resultado:
    | "verificado"
    | "aplicado"
    | "cerrado"
    | "no-encontrado"
    | "ya-cerrado"
    | "template-no-existe"
    | "error";
  mensaje: string;
  /** Status del incidente leído antes de actuar (si se pudo). */
  statusPrevio?: string;
}

const FORM_TIMEOUT_MS = 45_000;
const WIZARD_TIMEOUT_MS = 30_000;

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

/**
 * Click por evaluate sobre un botón de toolbar ExtJS buscado por su texto.
 * Reintenta hasta `timeoutMs`: la toolbar del incidente carga en un frame
 * aparte y tarda un poco más que instance/number, así que buscarla una sola vez
 * justo tras abrir el IM fallaba ("No se encontró el botón 'Apply Template'").
 *
 * El match es INSENSIBLE a mayúsculas: el botón de cierre se llama "close" en
 * minúscula en la toolbar del incidente (visto el 2026-10-31), no "Close".
 */
async function clickBotonToolbar(page: Page, texto: string, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const btnText = frame.locator(`:text-is("${texto}") >> visible=true`).first();
      // text-is es case-sensitive; probamos también por regex insensible.
      const porRegex = frame.getByText(new RegExp(`^\\s*${texto}\\s*$`, "i")).first();
      const cand = (await btnText.count().catch(() => 0)) > 0 ? btnText : porRegex;
      if (!(await cand.isVisible({ timeout: 500 }).catch(() => false))) continue;
      const btn = cand.locator(
        'xpath=ancestor-or-self::*[contains(concat(" ", normalize-space(@class), " "), " x-btn ")][1]',
      );
      const target = (await btn.count().catch(() => 0)) > 0 ? btn : cand;
      await target.evaluate((el) => (el as HTMLElement).click());
      return true;
    }
    await page.waitForTimeout(1_000);
  }
  return false;
}

/** Cierra las pestañas de aplicación de HPSM (igual que hpsm-incident.ts). */
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
}

/**
 * Lee el status del incidente. En un IM abierto está en
 * instance/problem.status; en uno CERRADO ese input no existe (form de solo
 * lectura) y el valor vive en el input cuyo <label> es "Status:" — igual que
 * documenta hpsm-incident.ts. "" si no se pudo leer.
 */
async function leerStatus(page: Page): Promise<string> {
  for (const f of page.frames()) {
    const inp = f.locator('input[name="instance/problem.status"]').first();
    if (await inp.count().catch(() => 0)) {
      const v = await inp.inputValue().catch(() => "");
      if (v) return v.trim();
    }
  }
  // Fallback para incidentes cerrados (Status sin name, localizado por label).
  for (const f of page.frames()) {
    const v = await f
      .evaluate(() => {
        for (const lbl of Array.from(document.querySelectorAll("label"))) {
          if (!/^Status\b/i.test((lbl.textContent ?? "").trim())) continue;
          const id = lbl.getAttribute("for");
          const el = id ? (document.getElementById(id) as HTMLInputElement | null) : null;
          if (el && typeof el.value === "string" && el.value.trim()) return el.value.trim();
        }
        return "";
      })
      .catch(() => "");
    if (v) return v;
  }
  return "";
}

/**
 * Cierra (o verifica/aplica, según `modo`) UN incidente. No lanza: todo error
 * queda en el resultado. Asume una sesión HPSM ya abierta (la pasa el job).
 */
export async function cerrarIncidente(
  page: Page,
  im: string,
  template: string,
  modo: ModoCierre,
): Promise<CierreResult> {
  const base: CierreResult = { im, template, modo, ok: false, resultado: "error", mensaje: "" };
  try {
    if (!IM_REGEX.test(im)) {
      return { ...base, mensaje: `IM con formato inválido: ${im}` };
    }
    if (!template.trim()) {
      return { ...base, mensaje: "Template vacío" };
    }

    // Paso 1-3: abrir el incidente.
    await page.goto(deepLink("probsummary", im), { waitUntil: "domcontentloaded", timeout: 30_000 });
    const detail = await waitForFrame(
      page,
      async (f) =>
        f.url().includes("detail.do") && (await f.locator('input[name="instance/number"]').count()) > 0,
      FORM_TIMEOUT_MS,
    );
    if (!detail) {
      return { ...base, resultado: "error", mensaje: "El formulario del incidente no cargó (detail.do)" };
    }
    const numero = (await detail.locator('input[name="instance/number"]').first().inputValue().catch(() => "")).trim();
    if (!numero) {
      return { ...base, resultado: "no-encontrado", mensaje: `IM ${im} no existe en HPSM` };
    }
    if (numero.toUpperCase() !== im) {
      return { ...base, resultado: "error", mensaje: `HPSM abrió ${numero} en lugar de ${im}` };
    }
    const statusPrevio = await leerStatus(page);

    // Si ya está cerrado, no hay toolbar de edición (form de solo lectura):
    // reportarlo y saltar en vez de fallar buscando "Apply Template".
    if (statusPrevio.toUpperCase() === "CLOSED") {
      await cerrarPestanas(page);
      return {
        ...base,
        ok: true,
        statusPrevio,
        resultado: "ya-cerrado",
        mensaje: `${im} ya está CLOSED — nada que hacer.`,
      };
    }

    // Paso 4: Apply Template.
    const abierto = await clickBotonToolbar(page, "Apply Template");
    if (!abierto) {
      return { ...base, statusPrevio, resultado: "error", mensaje: "No se encontró el botón 'Apply Template'" };
    }

    // Paso 5: wizard "Select Incident Template" — tabla de links <a>.
    const wizard = await waitForFrame(
      page,
      async (f) => (await f.locator('a:text-is("' + template.trim() + '")').count()) > 0
        // o al menos que el wizard haya cargado (algún link de template visible):
        || (await f.locator("text=Select the template that should be applied").count()) > 0,
      WIZARD_TIMEOUT_MS,
    );
    if (!wizard) {
      return { ...base, statusPrevio, resultado: "error", mensaje: "El wizard de templates no cargó" };
    }

    // Buscar el link exacto del template pedido.
    const link = wizard.locator(`a:text-is("${template.trim()}")`).first();
    const existe = (await link.count().catch(() => 0)) > 0 && (await link.isVisible().catch(() => false));

    if (!existe) {
      // Dejar el incidente como estaba: Cancel del wizard.
      await clickBotonToolbar(page, "Cancel");
      await cerrarPestanas(page);
      return {
        ...base,
        statusPrevio,
        resultado: "template-no-existe",
        mensaje: `El template "${template}" no está en la lista del wizard para ${im}`,
      };
    }

    // ── MODO VERIFICAR: todo OK, pero NO aplicar. Cancel y salir. ──
    if (modo === "verificar") {
      await clickBotonToolbar(page, "Cancel");
      await cerrarPestanas(page);
      return {
        ...base,
        ok: true,
        statusPrevio,
        resultado: "verificado",
        mensaje: `Listo para aplicar "${template}" a ${im} (status: ${statusPrevio || "?"}). No se aplicó nada (dry-run).`,
      };
    }

    // Paso 5 real: aplicar el template (click en el link).
    await link.evaluate((el) => (el as HTMLElement).click());
    await page.waitForTimeout(3_000);

    // ── MODO APLICAR: template aplicado, NO cerrar. ──
    if (modo === "aplicar") {
      // Diagnóstico: screenshot + inventario de botones de toolbar visibles,
      // para identificar el botón EXACTO del paso 6 (Close X) antes de cerrar
      // de verdad. Se detiene aquí sin cerrar.
      const shot = `aplicado-${im}.png`;
      await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
      const botones: string[] = [];
      for (const f of page.frames()) {
        const txts = await f
          .locator(".x-btn-text, button")
          .allInnerTexts()
          .catch(() => []);
        for (const t of txts) {
          const s = t.replace(/\s+/g, " ").trim();
          if (s && s.length < 40 && !botones.includes(s)) botones.push(s);
        }
      }
      logger.info(`aplicado ${im}: botones en toolbar → ${botones.join(" | ")}`);
      logger.info(`aplicado ${im}: screenshot en ${shot}`);
      // NO se cierran las pestañas aquí: dejamos el incidente abierto con el
      // template aplicado para la inspección. El cierre de sesión al terminar
      // el job descarta cambios no guardados (no se dio Close/Save).
      return {
        ...base,
        ok: true,
        statusPrevio,
        resultado: "aplicado",
        mensaje: `Template "${template}" aplicado a ${im} (sin cerrar). Revisa ${shot} y los botones del log.`,
      };
    }

    // ── MODO CERRAR: paso 6, Close (X) que guarda/cierra. IRREVERSIBLE. ──
    // Evidencia ANTES de cerrar: screenshot del incidente con el template ya
    // aplicado. Queda como prueba de qué se cerró, por si algo sale raro.
    await page.screenshot({ path: `cerrar-antes-${im}.png`, fullPage: true }).catch(() => {});

    // El botón que persiste el cierre tras aplicar el template. Visto el
    // 2026-10-31: el template *A TX SINC ya deja Status=Closed/Phase=Closure, y
    // la toolbar muestra "close" (minúscula) que es el que GUARDA ese cierre.
    // El match de clickBotonToolbar es insensible a mayúsculas. Se deja
    // "Save & Exit"/"OK" como respaldo por si otro template usa otra toolbar.
    let cerrado = false;
    let botonUsado = "";
    for (const texto of ["close", "Save & Exit", "OK"]) {
      if (await clickBotonToolbar(page, texto)) {
        cerrado = true;
        botonUsado = texto;
        logger.info(`cerrar-incidente ${im}: click en "${texto}" para cerrar`);
        break;
      }
    }
    if (!cerrado) {
      await cerrarPestanas(page);
      return {
        ...base,
        statusPrevio,
        resultado: "error",
        mensaje: `Template aplicado pero no se encontró el botón de cierre (Save & Exit/Close/OK) en ${im}`,
      };
    }
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: `cerrar-despues-${im}.png`, fullPage: true }).catch(() => {});

    // Verificar que de verdad cerró: reabrir el IM y leer el status. Si no quedó
    // CLOSED, el botón no era el correcto — se reporta para no dar un falso OK.
    await page.goto(deepLink("probsummary", im), { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
    await waitForFrame(
      page,
      async (f) => f.url().includes("detail.do") && (await f.locator('input[name="instance/number"]').count()) > 0,
      FORM_TIMEOUT_MS,
    );
    const statusFinal = await leerStatus(page);
    await cerrarPestanas(page);

    const quedoCerrado = statusFinal.toUpperCase() === "CLOSED";
    return {
      ...base,
      ok: quedoCerrado,
      statusPrevio,
      resultado: quedoCerrado ? "cerrado" : "error",
      mensaje: quedoCerrado
        ? `${im} CERRADO con template "${template}" (botón "${botonUsado}"). Status final: CLOSED.`
        : `${im}: se aplicó template y se apretó "${botonUsado}", pero el status final es "${statusFinal || "?"}" (no CLOSED). Revisa cerrar-despues-${im}.png.`,
    };
  } catch (e) {
    await cerrarPestanas(page).catch(() => {});
    return { ...base, resultado: "error", mensaje: (e as Error).message };
  }
}
