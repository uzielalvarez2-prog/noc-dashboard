import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Frame, Page } from "playwright";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { openHpsmSession, exportCurrentViewToCsv, clearSession } from "./session.js";

/**
 * Flujo HPSM:
 *  1. Incident Management → Search Incidents
 *  2. Llenar form: Assignment Group=PEXA, checkbox Closed, rango Closed After/Before
 *  3. Clic en botón toolbar "Search" (exact match — no confundir con tab "Text Search")
 *  4. Esperar frame cwc_listdetail.jsp (aparece async, hasta 90s)
 *  5. More → Export to Text File → CSV en ese frame
 *
 * Campos del form (name attributes reales):
 *   instance/assignment    → Assignment Group
 *   var/choices/closed     → Checkbox "Closed"
 *   var/adv.close.start    → Closed After this date  (formato YY/MM/DD HH:mm:ss)
 *   var/adv.close.end      → Closed Before this date
 */
async function waitForFrame(
  page: Page,
  urlPart: string,
  timeoutMs: number,
): Promise<Frame | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const f = page.frames().find(fr => fr.url().includes(urlPart));
    if (f) return f;
    await page.waitForTimeout(1_000);
  }
  return undefined;
}

const CLOSED_COLUMNS = [
  "Incident ID",
  "Open Time",
  "Status",
  "Closed By",
  "Close Time",
  "Res Analyst Code",
  "Company",
  "Assignment Group",
];

async function setColumns(
  page: Page,
  listDetailFrame: Frame,
  columns: string[],
): Promise<Frame> {
  const framesToSearch = [listDetailFrame, page.mainFrame()];
  let modifyDone = false;

  for (let attempt = 0; attempt < 4 && !modifyDone; attempt++) {
    if (attempt > 0) await page.waitForTimeout(1_500);
    for (const frame of framesToSearch) {
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
  if (!modifyDone) throw new Error("Modify Columns menu item no encontrado tras 4 intentos");

  await page.waitForTimeout(2_000);
  let colFrame: Frame | undefined;
  const deadline = Date.now() + 30_000;
  while (!colFrame && Date.now() < deadline) {
    for (const frame of page.frames()) {
      const has = await frame.locator('[name="var/L.current/L.current[1]"]').count().catch(() => 0) > 0;
      if (has) { colFrame = frame; break; }
    }
    if (!colFrame) await page.waitForTimeout(1_000);
  }
  if (!colFrame) throw new Error("choose.columns form no encontrado en 30s");
  logger.info(`Columns form en: ${colFrame.url()}`);

  // Llenar via ExtJS API — pressSequentially no actualiza el modelo interno de Ext
  await colFrame.evaluate((cols: string[]) => {
    const Ext = (window as any).Ext as any;
    for (let i = 0; i < 8; i++) {
      const name = `var/L.current/L.current[${i + 1}]`;
      const val = cols[i] ?? "";
      if (Ext?.ComponentQuery) {
        const comps = Ext.ComponentQuery.query(`[name="${name}"]`) as any[];
        if (comps.length > 0) { comps[0].setValue(val); continue; }
      }
      const el = document.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (!el) continue;
      el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, columns);
  await page.waitForTimeout(1_000);

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

  await page.waitForTimeout(3_000);
  const newFrame = await waitForFrame(page, "cwc_listdetail", 60_000);
  if (!newFrame) throw new Error("cwc_listdetail no aparecio tras Modify Columns");
  logger.info(`Frame actualizado tras Modify Columns: ${newFrame.url()}`);
  await page.waitForTimeout(2_000);
  return newFrame;
}

async function main(): Promise<void> {
  mkdirSync(config.downloadDir, { recursive: true });

  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const dateStr = `${yy}/${mm}/${dd}`;
  const afterStr  = `${dateStr} ${config.closed.startTime}:00`;
  const beforeStr = `${dateStr} ${config.closed.endTime}:00`;

  const dest = join(
    config.downloadDir,
    `closed-incidents-${now.toISOString().slice(0, 10)}.csv`,
  );

  // Forzar login fresco — igual que download-open.ts
  clearSession();

  const session = await openHpsmSession();
  try {
    const { page } = session;

    // ── 0. Limpieza de estado HPSM del session restore ───────────────────────
    // Al restaurar cookies, HPSM puede tener:
    //   a) Modal "Your inactive session will terminate" (genera ext-el-mask)
    //   b) Diálogo de export de corrida anterior (tab "Dialog")
    // Ambos deben cerrarse antes de navegar.
    await page.screenshot({ path: "debug-closed-step0-initial.png", fullPage: true });
    logger.info(`Frames iniciales: ${page.frames().map(f => f.url()).join(" | ")}`);

    // a) Dismiss session inactivity warning
    const sessionWarnVisible = await page.locator("text=Your inactive session").isVisible({ timeout: 5_000 }).catch(() => false);
    if (sessionWarnVisible) {
      logger.info("Sesión inactiva warning — cerrando con OK");
      await page.locator(".x-window button").filter({ hasText: "OK" }).first()
        .click({ force: true, timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(1_000);
    }

    // b) Cerrar diálogo export residual con Back si está abierto
    const backVisible = await page.locator("text=Back").first().isVisible({ timeout: 2_000 }).catch(() => false);
    if (backVisible) {
      logger.info("Diálogo export residual — cerrando con Back");
      await page.locator("text=Back").first().click({ force: true });
      await page.waitForTimeout(1_000);
    }

    // Ahora sí esperar que el mask desaparezca (debería ser rápido)
    await page.locator(".ext-el-mask").first()
      .waitFor({ state: "hidden", timeout: 15_000 })
      .catch(() => {});

    // ── 1. Navegación ─────────────────────────────────────────────────────────
    try {
      // Igual que download-open.ts: click nativo de Playwright (no evaluate)
      const incMgmt = page.locator("text=Incident Management").first();
      await incMgmt.waitFor({ state: "visible", timeout: 15_000 });
      await incMgmt.click({ timeout: 15_000 });
      await page.waitForTimeout(1_000);

      const searchInc = page.locator("text=Search Incidents").first();
      await searchInc.waitFor({ state: "visible", timeout: 10_000 });

      // Escuchar por nuevos frames ANTES del click
      const newFramePromise = page.waitForEvent("frameattached", { timeout: 20_000 }).catch(() => null);
      await searchInc.click({ timeout: 10_000 });

      const newFrame = await newFramePromise;
      if (newFrame) {
        logger.info(`Nuevo frame tras nav: ${newFrame.url()}`);
      }
      await page.waitForTimeout(4_000);
    } catch (err) {
      await page.screenshot({ path: "debug-closed-step1-menu.png", fullPage: true });
      throw err;
    }

    logger.info(`Frames tras navegar: ${page.frames().map(f => f.url()).join(" | ")}`);
    await page.screenshot({ path: "debug-closed-step1-afternav.png", fullPage: true });

    // ── 2. Encontrar el frame que contiene el form (por presencia en DOM) ───────
    // Buscar el frame que tenga AMBOS campos: assignment Y choices/closed.
    // Esto evita tomar un frame stale de corridas anteriores que solo tiene assignment.
    let formFrame: Frame | undefined;
    const formDeadline = Date.now() + 60_000;
    while (!formFrame && Date.now() < formDeadline) {
      for (const frame of page.frames()) {
        const hasAssign = await frame.locator('[name="instance/assignment"]').count().catch(() => 0) > 0;
        if (!hasAssign) continue;
        const hasClosed = await frame.locator('[id="var/choices/closed"]').count().catch(() => 0) > 0;
        if (hasClosed) { formFrame = frame; break; }
      }
      if (!formFrame) {
        logger.info(`Esperando form... frames: ${page.frames().map(f => f.url()).join(" | ")}`);
        await page.waitForTimeout(1_000);
      }
    }
    if (!formFrame) {
      await page.screenshot({ path: "debug-closed-step2-noframe.png", fullPage: true });
      throw new Error("Form Search Incidents no encontrado en ningún frame tras 60s");
    }
    logger.info(`Form en: ${formFrame.url()}`);

    // ── 3. Llenar el formulario ───────────────────────────────────────────────
    // Usar force:true para funcionar aunque el form esté en un tab de fondo (no visible)
    await formFrame.locator('[name="instance/assignment"]')
      .fill(config.closed.group, { force: true, timeout: 10_000 });

    // Checkbox Closed — JS click (ignora visibilidad/interceptores)
    await formFrame.locator('[id="var/choices/closed"]')
      .evaluate((el) => (el as HTMLInputElement).click());

    // Fechas
    await formFrame.locator('[name="var/adv.close.start"]').fill(afterStr, { force: true });
    await formFrame.locator('[name="var/adv.close.end"]').fill(beforeStr, { force: true });

    await page.screenshot({ path: "debug-closed-step2-filled.png", fullPage: true });
    logger.info(`Form llenado: PEXA, Closed, ${afterStr} – ${beforeStr}`);

    // ── 4. Clic en botón Search del toolbar ───────────────────────────────────
    // :text-is() = exact match — NO matchea el tab "Text Search"
    // Buscar en todos los frames (el toolbar puede estar en formFrame o en index.do)
    {
      let searchClicked = false;
      const orderedFrames = [formFrame, ...page.frames().filter(f => f !== formFrame)];
      for (const frame of orderedFrames) {
        const n = await frame.locator(':text-is("Search")').count().catch(() => 0);
        if (n > 0) {
          await frame.locator(':text-is("Search")').first()
            .evaluate((el) => (el as HTMLElement).click());
          searchClicked = true;
          logger.info(`Search click en: ${frame.url()}`);
          break;
        }
      }
      if (!searchClicked) {
        logger.warn("Search button no encontrado — fallback form.submit()");
        await formFrame.evaluate(() => {
          const ev = document.getElementById("event") as HTMLInputElement | null;
          if (ev) ev.value = "search";
          (document.querySelector<HTMLFormElement>("form") ?? { submit() {} }).submit();
        });
      }
    }

    // ── 5. Esperar frame cwc_listdetail.jsp (resultados reales) ───────────────
    // HPSM carga los resultados de forma asíncrona en este frame.
    // NO usar waitForLoadState("networkidle") — HPSM hace polling continuo.
    logger.info("Esperando cwc_listdetail.jsp (hasta 90s)...");
    const listDetailFrame = await waitForFrame(page, "cwc_listdetail", 90_000);
    if (!listDetailFrame) {
      await page.screenshot({ path: "debug-closed-step3-nolist.png", fullPage: true });
      throw new Error("cwc_listdetail.jsp no apareció en 90s — ¿0 resultados?");
    }
    logger.info(`Resultados en: ${listDetailFrame.url()}`);
    await page.waitForTimeout(2_000); // dejar que el frame termine de renderizar

    await page.screenshot({ path: "debug-closed-step3-results.png", fullPage: true });

    // ── 6. More → Export en el frame de resultados ────────────────────────────
    // Las columnas de cerrados ya son correctas en la cuenta HPSM del scraper,
    // no se necesita Modify Columns.
    await exportCurrentViewToCsv(page, dest, listDetailFrame);
    logger.info("Descarga de incidentes cerrados completada");
  } finally {
    await session.close();
  }
}

export { main as downloadClosed };

// Ejecutar solo cuando se invoca directamente (no cuando se importa)
if (process.argv[1]?.replace(/\\/g, "/").endsWith("download-closed.ts") ||
    process.argv[1]?.replace(/\\/g, "/").endsWith("download-closed.js")) {
  main().catch((err) => {
    logger.error("Error descargando incidentes cerrados", { err: String(err) });
    process.exit(1);
  });
}
