import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Frame, Page } from "playwright";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { openHpsmSession, exportCurrentViewToCsv, clearSession } from "./session.js";

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

// Columnas para incidentes abiertos (deben ser captions validos en HPSM)
const OPEN_COLUMNS = [
  "Incident ID",
  "Open Time",
  "Status",
  "Assignment Group",
  "Assignee",
  "Company",
  "Region",
  "Divisional",
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

  // Buscar el frame con los inputs de columnas
  let colFrame: Frame | undefined;
  const deadline = Date.now() + 30_000;
  while (!colFrame && Date.now() < deadline) {
    for (const frame of page.frames()) {
      const has = await frame.locator('[name="var/L.current/L.current[1]"]')
        .count().catch(() => 0) > 0;
      if (has) { colFrame = frame; break; }
    }
    if (!colFrame) await page.waitForTimeout(1_000);
  }
  if (!colFrame) throw new Error("choose.columns form no encontrado en 30s");
  logger.info(`Columns form en: ${colFrame.url()}`);

  // Llenar los 8 inputs usando teclado — fill() no actualiza el modelo ExtJS
  await page.screenshot({ path: "debug-columns-before.png", fullPage: true });
  for (let i = 0; i < 8; i++) {
    const val = columns[i] ?? "";
    const input = colFrame.locator(`[name="var/L.current/L.current[${i + 1}]"]`);
    try {
      await input.click({ force: true });
      await page.keyboard.press("Control+a");
      await page.keyboard.press("Delete");
      if (val) await page.keyboard.type(val, { delay: 40 });
    } catch { /* ignorar */ }
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: "debug-columns-after.png", fullPage: true });
  await page.waitForTimeout(1_000);

  // Click Proceed (con reintentos — tarda en renderizar)
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
  const dest = join(config.downloadDir, "open-incidents.csv");

  // Forzar login fresco — elimina cookies del run anterior para evitar que HPSM
  // restaure un workspace con thread=9&notredirect=true que bloquea la carga del form.
  clearSession();

  const session = await openHpsmSession();
  try {
    const { page } = session;

    // 0. Cleanup estado HPSM
    const sessionWarnVisible = await page.locator("text=Your inactive session")
      .isVisible({ timeout: 5_000 }).catch(() => false);
    if (sessionWarnVisible) {
      logger.info("Sesion inactiva warning — cerrando");
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

    // 1. Incident Management -> Search Incidents
    try {
      const incMgmt = page.locator("text=Incident Management").first();
      await incMgmt.waitFor({ state: "visible", timeout: 15_000 });
      await incMgmt.click({ timeout: 15_000 });
      await page.waitForTimeout(1_000);

      const searchInc = page.locator("text=Search Incidents").first();
      await searchInc.waitFor({ state: "visible", timeout: 10_000 });
      const newFramePromise = page.waitForEvent("frameattached", { timeout: 20_000 }).catch(() => null);
      await searchInc.click({ timeout: 10_000 });
      await newFramePromise;
      await page.waitForTimeout(4_000);
    } catch (err) {
      await page.screenshot({ path: "debug-open-step1-nav.png", fullPage: true });
      throw err;
    }

    logger.info(`Frames tras navegar: ${page.frames().map(f => f.url()).join(" | ")}`);

    // 2. Encontrar el frame del formulario (hasta 60s — con cookie restore HPSM
    //    reutiliza el thread anterior y el form tarda mas en cargar)
    let formFrame: Frame | undefined;
    const formDeadline = Date.now() + 60_000;
    while (!formFrame && Date.now() < formDeadline) {
      for (const frame of page.frames()) {
        const hasAssign = await frame.locator('[name="instance/assignment"]').count().catch(() => 0) > 0;
        if (!hasAssign) continue;
        const hasOpen = await frame.locator('[id="var/choices/open"]').count().catch(() => 0) > 0;
        if (hasOpen) { formFrame = frame; break; }
      }
      if (!formFrame) await page.waitForTimeout(1_000);
    }
    if (!formFrame) {
      await page.screenshot({ path: "debug-open-step2-noframe.png", fullPage: true });
      throw new Error("Form Search Incidents no encontrado en ningun frame tras 60s");
    }
    logger.info(`Form en: ${formFrame.url()}`);

    // 3. Checkbox Open (sin grupo ni fechas)
    await formFrame.locator('[id="var/choices/open"]')
      .evaluate((el) => (el as HTMLInputElement).click());
    logger.info("Form llenado: Open (todos los grupos, sin rango de fechas)");

    // 4. Clic en Search
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

    // 5. Esperar cwc_listdetail.jsp
    logger.info("Esperando cwc_listdetail.jsp (hasta 120s)...");
    const listDetailFrame = await waitForFrame(page, "cwc_listdetail", 120_000);
    if (!listDetailFrame) {
      await page.screenshot({ path: "debug-open-step3-nolist.png", fullPage: true });
      throw new Error("cwc_listdetail.jsp no aparecio en 120s");
    }
    logger.info(`Resultados en: ${listDetailFrame.url()}`);
    await page.waitForTimeout(2_000);

    // 5.5. Fijar columnas para open incidents (evita heredar config de closed)
    logger.info("Configurando columnas para open incidents...");
    const freshFrame = await setColumns(page, listDetailFrame, OPEN_COLUMNS);

    // 6. More -> Export
    await exportCurrentViewToCsv(page, dest, freshFrame);
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
