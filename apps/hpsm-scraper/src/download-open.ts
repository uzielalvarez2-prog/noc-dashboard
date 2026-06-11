import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { openHpsmSession, exportCurrentViewToCsv, clearSession } from "./session.js";

const FAVORITES_QUEUE = "All Open Incidents CARE";

// Columnas que necesitamos en el CSV de abiertos.
// "Modify Columns" las guarda por usuario en HPSM — se aplica en cada run para garantizar consistencia.
const OPEN_COLUMNS = [
  "Incident ID",
  "Open Time",
  "Status",
  "Assignment Group",
  "Assigned To",
  "Priority",
  "Company",
  "Divisional",
];

/**
 * Abre More → Modify Columns, establece los 8 campos requeridos y hace clic en Proceed.
 * Después espera a que la vista se recargue con los nuevos encabezados.
 */
async function setColumnsForQueue(page: Page): Promise<void> {
  // 1. Clic en More → Modify Columns (buscar en todos los frames)
  let modifyDone = false;
  for (let attempt = 0; attempt < 4 && !modifyDone; attempt++) {
    if (attempt > 0) await page.waitForTimeout(1_500);
    for (const frame of page.frames()) {
      try {
        const moreText = frame.locator(':text-is("More")').first();
        const moreBtn = moreText.locator(
          'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " x-btn ")][1]',
        );
        await moreBtn.waitFor({ state: "attached", timeout: 5_000 });
        await moreBtn.evaluate((el) => (el as HTMLElement).click());
        break;
      } catch { /* next frame */ }
    }
    await page.waitForTimeout(1_500);
    for (const frame of page.frames()) {
      const opt = frame.locator("text=Modify Columns").first();
      if (await opt.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await opt.evaluate((el) => (el as HTMLElement).click());
        modifyDone = true;
        logger.info(`Modify Columns click en frame: ${frame.url()}`);
        break;
      }
    }
  }
  if (!modifyDone) throw new Error("Modify Columns no encontrado tras 4 intentos");

  // 2. Esperar el formulario de columnas (aparece en un frame detail.do)
  await page.waitForTimeout(2_000);
  let colFrame = undefined as import("playwright").Frame | undefined;
  const cfDeadline = Date.now() + 30_000;
  while (!colFrame && Date.now() < cfDeadline) {
    for (const frame of page.frames()) {
      const n = await frame.locator('input[name^="var/L.current"]').count().catch(() => 0);
      if (n > 0) { colFrame = frame; break; }
    }
    if (!colFrame) await page.waitForTimeout(1_000);
  }
  if (!colFrame) throw new Error("Modify Columns form no encontrado en 30s");
  logger.info(`Columns form en: ${colFrame.url()}`);

  // 3. Rellenar los campos usando ExtJS API; fallback a DOM con createEvent para
  //    evitar el error "parameter 1 is not of type 'Event'" en contextos cross-frame.
  await colFrame.evaluate((cols: string[]) => {
    const Ext = (window as any).Ext;
    for (let i = 0; i < cols.length; i++) {
      const name = `var/L.current/L.current[${i + 1}]`;
      const val = cols[i] ?? "";
      if (Ext?.ComponentQuery) {
        const allFields = Ext.ComponentQuery.query("textfield") as any[];
        const comp = allFields.find((c: any) => c.name === name || c.getName?.() === name);
        if (comp) { comp.setValue(val); continue; }
      }
      const el = document.querySelector<HTMLInputElement>(`[name="${CSS.escape(name)}"]`)
        ?? document.querySelector<HTMLInputElement>(`[name='${name}']`);
      if (!el) continue;
      el.value = val;
      const ev1 = el.ownerDocument.createEvent("Event");
      ev1.initEvent("input", true, false);
      el.dispatchEvent(ev1);
      const ev2 = el.ownerDocument.createEvent("Event");
      ev2.initEvent("change", true, false);
      el.dispatchEvent(ev2);
    }
  }, OPEN_COLUMNS);
  await page.waitForTimeout(1_000);

  // 4. Clic en Proceed
  let proceedClicked = false;
  for (let retry = 0; retry < 3 && !proceedClicked; retry++) {
    await page.waitForTimeout(2_000);
    for (const frame of page.frames()) {
      const btn = frame.locator(':text-is("Proceed")').first();
      if (await btn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await btn.evaluate((el) => (el as HTMLElement).click());
        proceedClicked = true;
        logger.info(`Proceed click en frame: ${frame.url()}`);
        break;
      }
    }
  }
  if (!proceedClicked) throw new Error("Proceed button no encontrado tras 3 intentos");

  // 5. Esperar que la vista se recargue con los nuevos encabezados
  await page.waitForTimeout(15_000);
  logger.info("Modify Columns completado — vista recargada");
}


async function main(): Promise<void> {
  mkdirSync(config.downloadDir, { recursive: true });
  const dest = join(config.downloadDir, "open-incidents.csv");

  clearSession();

  const session = await openHpsmSession();
  try {
    const { page } = session;

    // ── 0. Cerrar modales residuales de sesión anterior ──────────────────────
    const sessionWarn = await page.locator("text=Your inactive session")
      .isVisible({ timeout: 5_000 }).catch(() => false);
    if (sessionWarn) {
      await page.locator(".x-window button").filter({ hasText: "OK" }).first()
        .click({ force: true, timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(1_000);
    }
    const backVisible = await page.locator("text=Back").first()
      .isVisible({ timeout: 2_000 }).catch(() => false);
    if (backVisible) {
      await page.locator("text=Back").first().click({ force: true });
      await page.waitForTimeout(1_000);
    }
    await page.locator(".ext-el-mask").first()
      .waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});

    // ── 1. Expandir "Favorites and Dashboards" si está colapsado ─────────────
    const allOpenVisible = await page.locator(`text="${FAVORITES_QUEUE}"`).first()
      .isVisible({ timeout: 3_000 }).catch(() => false);
    if (!allOpenVisible) {
      logger.info("Expandiendo Favorites and Dashboards...");
      for (const frame of page.frames()) {
        const favLink = frame.locator('text="Favorites and Dashboards"').first();
        if (await favLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await favLink.evaluate((el) => (el as HTMLElement).click());
          await page.waitForTimeout(1_500);
          break;
        }
      }
    }

    // ── 2. Click en "All Open Incidents CARE" ────────────────────────────────
    logger.info(`Buscando "${FAVORITES_QUEUE}" en el panel de navegación...`);
    let queueClicked = false;
    const deadline = Date.now() + 20_000;
    while (!queueClicked && Date.now() < deadline) {
      for (const frame of page.frames()) {
        const link = frame.locator(`text="${FAVORITES_QUEUE}"`).first();
        if (await link.isVisible({ timeout: 1_000 }).catch(() => false)) {
          await link.evaluate((el) => (el as HTMLElement).click());
          queueClicked = true;
          logger.info(`"${FAVORITES_QUEUE}" clickeado en frame: ${frame.url()}`);
          break;
        }
      }
      if (!queueClicked) await page.waitForTimeout(1_000);
    }
    if (!queueClicked) {
      await page.screenshot({ path: "debug-open-step1-nofav.png", fullPage: true });
      throw new Error(`"${FAVORITES_QUEUE}" no encontrado en la barra lateral tras 20s`);
    }

    // ── 3. Esperar que cargue el queue (~20-30s manualmente) ────────────────────
    // Esperamos 40s fijo: suficiente para que HPSM renderice la vista completa.
    logger.info("Esperando 40s para que cargue el queue de incidentes...");
    await page.waitForTimeout(5_000);
    logger.info(`Frames a los 5s: ${page.frames().map(f => f.url()).join(" | ")}`);
    await page.screenshot({ path: "debug-open-step2-5s.png", fullPage: true });
    await page.waitForTimeout(35_000);
    logger.info(`Frames a los 40s: ${page.frames().map(f => f.url()).join(" | ")}`);
    await page.screenshot({ path: "debug-open-step2-40s.png", fullPage: true });

    // ── 4. Modify Columns (Assignment Group + campos requeridos) ─────────────
    logger.info("Configurando columnas del CSV...");
    await setColumnsForQueue(page);

    // ── 5. More → Export to Text File → CSV → ✓ ─────────────────────────────
    logger.info("Exportando vista a CSV...");
    await exportCurrentViewToCsv(page, dest);
    logger.info("Descarga de incidentes abiertos completada");

  } finally {
    await session.close();
  }
}

export { main as downloadOpen };

if (process.argv[1]?.replace(/\\/g, "/").endsWith("download-open.ts") ||
    process.argv[1]?.replace(/\\/g, "/").endsWith("download-open.js")) {
  main().catch((err) => {
    logger.error("Error descargando incidentes abiertos", { err: String(err) });
    process.exit(1);
  });
}
