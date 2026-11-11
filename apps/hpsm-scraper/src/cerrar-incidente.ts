import type { Frame, Page } from "playwright";
import { logger } from "./logger.js";
import { IM_REGEX, abrirIncidentePorBuscador } from "./hpsm-incident.js";

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
 *   6.   Cerrar                   → GUARDA/CIERRA el incidente. IRREVERSIBLE.
 *                                    Dos escenarios (ambos: el template ya dejó
 *                                    Status=Closed/Phase=Closure):
 *                                      A) botón "close" en la toolbar (persiste
 *                                         directo; visto 2026-10-31, *A TX SINC).
 *                                      B) sin "close": se da "Cancel" y HPSM abre
 *                                         el popup "unsaved changes… Save them
 *                                         now?" → "Yes" persiste (visto
 *                                         2026-11-06, IMSDED*).
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

const WIZARD_TIMEOUT_MS = 30_000;

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

/**
 * Atrapa el popup de confirmación de HPSM "You have unsaved changes to this
 * record. Save them now?" (aparece como pestaña "Question" tras dar Cancel en un
 * incidente con cambios sin guardar) y presiona **Yes** para PERSISTIR esos
 * cambios. Escenario visto el 2026-11-06 con los IMSDED*: el template deja
 * Status=Closed/Phase=Closure, la toolbar NO tiene botón "close", y el cierre se
 * guarda por este diálogo al salir con Cancel.
 *
 * CRÍTICO: solo se clickea "Yes". "No" descartaría el cierre y "Cancel" volvería
 * al incidente — por eso el match es ESTRICTO (texto == "Yes"), no un contains.
 * Devuelve true si encontró y clickeó el Yes; false si no apareció el popup.
 */
async function clickPopupYes(page: Page, timeoutMs = 8_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      // Confirmar que es el diálogo de cambios sin guardar (no cualquier Yes
      // suelto): debe contener el texto "unsaved changes"/"Save them now".
      const esDialogo = await frame
        .locator('text=/unsaved changes|Save them now/i')
        .first()
        .count()
        .catch(() => 0);
      if (!esDialogo) continue;
      // Botón Yes: match ESTRICTO al texto "Yes" (case-insensitive), visible.
      const yes = frame.getByText(/^\s*Yes\s*$/i).first();
      if (!(await yes.isVisible({ timeout: 500 }).catch(() => false))) continue;
      const btn = yes.locator(
        'xpath=ancestor-or-self::*[self::button or contains(concat(" ", normalize-space(@class), " "), " x-btn ")][1]',
      );
      const target = (await btn.count().catch(() => 0)) > 0 ? btn : yes;
      await target.evaluate((el) => (el as HTMLElement).click());
      return true;
    }
    await page.waitForTimeout(500);
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

    // Paso 1-3: abrir el incidente por el buscador (los deep links ctx=docEngine
    // dejaron de funcionar el 2026-11-11: "Invalid query hash in URL").
    let detail: Frame;
    try {
      detail = await abrirIncidentePorBuscador(page, im);
    } catch (e) {
      return { ...base, resultado: "error", mensaje: `No se pudo abrir ${im} por el buscador: ${(e as Error).message}` };
    }
    // Esperar a que instance/number se pueble: en un servidor lento (Railway)
    // el frame existe pero el valor tarda, y leerlo de inmediato daba un falso
    // "no encontrado". Se reintenta hasta 12 s.
    let numero = "";
    const numDeadline = Date.now() + 12_000;
    while (Date.now() < numDeadline) {
      numero = (await detail.locator('input[name="instance/number"]').first().inputValue().catch(() => "")).trim();
      if (numero) break;
      await page.waitForTimeout(1_000);
    }
    if (!numero) {
      // Diagnóstico: screenshot de lo que HPSM mostró (form de búsqueda si el IM
      // no existe, o el incidente si solo tardó). Ayuda a distinguir ambos.
      await page.screenshot({ path: `no-encontrado-${im}.png`, fullPage: true }).catch(() => {});
      logger.warn(`cerrar-incidente ${im}: instance/number vacío tras 12s → screenshot no-encontrado-${im}.png`);
      return { ...base, resultado: "no-encontrado", mensaje: `IM ${im} no existe en HPSM (o HPSM no lo devolvió)` };
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

    // Hay DOS escenarios de cierre según el incidente/template (ambos dejan
    // Status=Closed/Phase=Closure tras aplicar el template):
    //
    //   A) Toolbar con "close" (visto 2026-10-31, *A TX SINC): el botón "close"
    //      (minúscula) de la toolbar GUARDA el cierre directamente.
    //   B) Toolbar con "Cancel" + popup (visto 2026-11-06, IMSDED*): NO hay
    //      botón "close". Se da "Cancel" y HPSM abre el diálogo "You have
    //      unsaved changes… Save them now?" — se presiona "Yes" y eso persiste
    //      el cierre ("Incident record updated").
    //
    // Se intenta A primero (más directo); si no hay "close" en la toolbar, se
    // usa B. El match de clickBotonToolbar es insensible a mayúsculas.
    let cerrado = false;
    let botonUsado = "";

    // Escenario A: botón "close"/"Save & Exit"/"OK" en la toolbar.
    for (const texto of ["close", "Save & Exit", "OK"]) {
      if (await clickBotonToolbar(page, texto, 5_000)) {
        cerrado = true;
        botonUsado = texto;
        logger.info(`cerrar-incidente ${im}: escenario A, click en "${texto}" para cerrar`);
        break;
      }
    }

    // Escenario B: no hubo botón de cierre directo → Cancel + popup "Yes".
    if (!cerrado) {
      logger.info(`cerrar-incidente ${im}: sin botón de cierre en toolbar → escenario B (Cancel + popup Yes)`);
      const dioCancel = await clickBotonToolbar(page, "Cancel", 8_000);
      if (dioCancel) {
        if (await clickPopupYes(page)) {
          cerrado = true;
          botonUsado = "Cancel → Yes (unsaved changes)";
          logger.info(`cerrar-incidente ${im}: escenario B, popup "Save them now?" → Yes`);
        } else {
          logger.warn(`cerrar-incidente ${im}: dio Cancel pero no apareció el popup "Save them now?"`);
        }
      }
    }

    if (!cerrado) {
      await page.screenshot({ path: `sin-boton-cierre-${im}.png`, fullPage: true }).catch(() => {});
      await cerrarPestanas(page);
      return {
        ...base,
        statusPrevio,
        resultado: "error",
        mensaje: `Template aplicado pero no se pudo cerrar ${im}: ni botón "close" en toolbar ni popup "unsaved changes → Yes". Revisa sin-boton-cierre-${im}.png`,
      };
    }
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: `cerrar-despues-${im}.png`, fullPage: true }).catch(() => {});

    // Verificar que de verdad cerró. OPTIMIZACIÓN: tras cerrar, HPSM suele dejar
    // el detalle en pantalla con Status=Closed, así que primero se intenta leer
    // AHÍ MISMO (sin reabrir). Solo si ahí NO se ve CLOSED (status vacío, o aún
    // en estado intermedio) se reabre el IM por el buscador para confirmar de
    // forma fehaciente. En el caso normal esto ahorra una navegación de menú
    // completa por IM; en el dudoso, mantiene la verificación robusta.
    let statusFinal = await leerStatus(page);
    if (statusFinal.toUpperCase() !== "CLOSED") {
      await abrirIncidentePorBuscador(page, im).catch(() => {});
      statusFinal = await leerStatus(page);
    }
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
    return { ...base, resultado: "error", mensaje: (e as Error).message };
  } finally {
    // RED DE SEGURIDAD: pase lo que pase (éxito, error, o un return temprano por
    // "Apply Template" no encontrado, etc.), se cierran las pestañas del IM para
    // que su detalle NO se quede en pantalla y se arrastre al IM siguiente (era
    // la causa del "HPSM abrió IMVIEJO en lugar de IMNUEVO" en el cierre masivo).
    // EXCEPCIÓN: en modo "aplicar" se deja el IM abierto a propósito (inspección).
    if (modo !== "aplicar") {
      await cerrarPestanas(page).catch(() => {});
    }
  }
}
