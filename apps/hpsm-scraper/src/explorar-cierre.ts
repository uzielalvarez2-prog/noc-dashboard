import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Frame } from "playwright";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { openHpsmSession } from "./session.js";
import { IM_REGEX } from "./hpsm-incident.js";

/**
 * PASO 0 — Reconocimiento del formulario de cierre (uso manual, NO es un job).
 *
 * Abre UN incidente que tú elijas (env IM) en modo visible, navega a su form
 * (probsummary, igual que hpsm-incident.ts) y vuelca a disco TODO lo clickeable
 * y todos los campos del formulario: botones de la toolbar ExtJS, labels de
 * combos, inputs con name, etc. — con screenshots por frame.
 *
 * Con ese inventario tú me dictas la secuencia de cierre ("clic en Close →
 * Closure Code = X → ✓") y yo la traduzco a cerrarIncidente(). NADA se cierra
 * aquí: este script solo observa.
 *
 * Uso (PowerShell, desde apps/hpsm-scraper):
 *   $env:HEADED="true"; $env:IM="IM12345678"; pnpm tsx src/explorar-cierre.ts
 */

const FORM_TIMEOUT_MS = 45_000;

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
  page: import("playwright").Page,
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

/** Inventaría lo interactivo de un frame: toolbar ExtJS, botones, combos, inputs. */
async function inventariarFrame(frame: Frame): Promise<unknown> {
  // CRÍTICO: sin funciones (ni flechas) declaradas dentro de evaluate — tsx
  // inyecta __name en toda función y ese símbolo no existe en el navegador.
  // Todo va inline, igual que en hpsm-incident.ts.
  return frame.evaluate(() => {
    // Botones de la toolbar ExtJS (More, Save, Close, Resolve, etc.) — se
    // renderizan como .x-btn con el texto en .x-btn-text o en un <button>.
    const botones = Array.from(document.querySelectorAll(".x-btn, button, [role='button']"))
      .map((el) => ((el.querySelector(".x-btn-text") ?? el).textContent ?? "").replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 0 && t.length < 40);

    // Ítems de menús flotantes (lo que aparece bajo "More").
    const menuItems = Array.from(document.querySelectorAll(".x-menu-item-text, .x-menu-item"))
      .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 0 && t.length < 60);

    // Campos de formulario con name (los editables de un incidente abierto).
    const inputs = Array.from(document.querySelectorAll("input[name], select[name], textarea[name]"))
      .map((el) => {
        const e = el as HTMLInputElement;
        return { name: e.getAttribute("name") ?? "", tag: e.tagName.toLowerCase(), type: e.getAttribute("type") ?? "", value: (e.value ?? "").slice(0, 60) };
      })
      .filter((i) => i.name);

    // Labels (para mapear combos sin name, como Closure Code / Status).
    const labels = Array.from(document.querySelectorAll("label"))
      .map((el) => ({ text: (el.textContent ?? "").replace(/\s+/g, " ").trim(), for: el.getAttribute("for") ?? "" }))
      .filter((l) => l.text);

    return { botones: [...new Set(botones)], menuItems: [...new Set(menuItems)], inputs, labels };
  });
}

async function main(): Promise<void> {
  const im = (process.env.IM ?? "").trim().toUpperCase();
  if (!IM_REGEX.test(im)) {
    throw new Error(`Define un IM válido: $env:IM="IM12345678" (recibido: "${im || "(vacío)"}")`);
  }
  if (!config.headed) {
    logger.warn('Corriendo headless — para VER el navegador usa $env:HEADED="true"');
  }

  const session = await openHpsmSession();
  const { page } = session;
  const outDir = process.cwd();
  try {
    logger.info(`Abriendo IM ${im}…`);
    await page.goto(deepLink("probsummary", im), { waitUntil: "domcontentloaded", timeout: 30_000 });

    const detail = await waitForFrame(
      page,
      async (f) => f.url().includes("detail.do") && (await f.locator('input[name="instance/number"]').count()) > 0,
      FORM_TIMEOUT_MS,
    );
    if (!detail) throw new Error("No cargó el formulario del incidente (detail.do)");

    const numero = (await detail.locator('input[name="instance/number"]').first().inputValue().catch(() => "")).trim();
    logger.info(`Formulario cargado. instance/number = "${numero}"`);
    if (numero.toUpperCase() !== im) {
      logger.warn(`HPSM mostró "${numero}" en vez de ${im} — ¿existe el IM? Revisa el screenshot.`);
    }

    // Abrir el menú "Apply Template" para capturar su lista fija de templates
    // (paso 4-5 del cierre). Mismo truco que session.ts: localizar el texto del
    // botón, subir al x-btn ancestro y hacer click por evaluate (ExtJS
    // intercepta pointer events). NO se selecciona ninguno — solo se lista.
    const menuTemplates: string[] = [];
    try {
      for (const frame of page.frames()) {
        const btnText = frame.locator(':text-is("Apply Template")').first();
        if (!(await btnText.isVisible({ timeout: 2_000 }).catch(() => false))) continue;
        const btn = btnText.locator(
          'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " x-btn ")][1]',
        );
        await btn.evaluate((el) => (el as HTMLElement).click());
        await page.waitForTimeout(2_000);
        // El menú/diálogo de templates aparece en algún frame. Capturamos tanto
        // ítems de menú ExtJS como filas de una posible lista/grid de templates.
        for (const f of page.frames()) {
          const sel = ".x-menu-item-text, .x-menu-item, .x-grid3-cell-inner, option";
          const items = await f.locator(sel).allInnerTexts().catch(() => []);
          for (const it of items) {
            const t = it.replace(/\s+/g, " ").trim();
            if (t && t.length < 80 && !menuTemplates.includes(t)) menuTemplates.push(t);
          }
        }
        break;
      }
      logger.info(
        `Opciones de Apply Template (${menuTemplates.length}): ${menuTemplates.length ? menuTemplates.join(" | ") : "(ninguna capturada)"}`,
      );
    } catch (e) {
      logger.warn(`No se pudo abrir/leer el menú Apply Template: ${String(e)}`);
    }

    // Inventario de cada frame + screenshot numerado.
    const inventario: Record<string, unknown> = {};
    let i = 0;
    for (const frame of page.frames()) {
      const url = frame.url();
      if (!url || url === "about:blank") continue;
      inventario[`frame${i}:${url}`] = await inventariarFrame(frame).catch((e) => ({ error: String(e) }));
      i++;
    }

    const shot = join(outDir, `explorar-cierre-${im}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    const jsonPath = join(outDir, `explorar-cierre-${im}.json`);
    writeFileSync(jsonPath, JSON.stringify({ statusInput: numero, menuTemplates, frames: inventario }, null, 2));

    logger.info(`Screenshot: ${shot}`);
    logger.info(`Inventario: ${jsonPath}`);
    logger.info("Revisa esos dos archivos y dime la secuencia de botones para cerrar este IM.");

    // En headed, deja el navegador abierto un rato para que lo explores a mano.
    if (config.headed) {
      logger.info("Modo headed: el navegador queda abierto 3 min para que explores. Ctrl+C para salir antes.");
      await page.waitForTimeout(180_000);
    }
  } finally {
    await session.close();
  }
}

main().catch((err) => {
  logger.error("Error explorando cierre", { err: String(err) });
  process.exit(1);
});
