import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Frame, Page } from "playwright";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { openHpsmSession, exportCurrentViewToCsv } from "./session.js";

/**
 * Flujo HPSM:
 *  1. Incident Management -> Search Incidents
 *  2. Llenar form: checkbox Open (sin filtro de grupo ni fechas = todos los grupos)
 *  3. Search -> cwc_listdetail.jsp -> More -> Export CSV
 *
 * Se usa Search Incidents (igual que download-closed) porque el boton More
 * del toolbar principal (index.do) siempre exporta thread=0 (To-Do Queue),
 * mientras que el More en cwc_listdetail.jsp exporta correctamente los
 * resultados de la busqueda activa.
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

async function main(): Promise<void> {
  mkdirSync(config.downloadDir, { recursive: true });
  const dest = join(config.downloadDir, "open-incidents.csv");

  const session = await openHpsmSession();
  try {
    const { page } = session;

    // ── 0. Cleanup estado HPSM (session restore puede tener modal/mask) ──────
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

    // ── 1. Navegacion: Incident Management -> Search Incidents ────────────────
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
      await page.waitForTimeout(2_000);
    } catch (err) {
      await page.screenshot({ path: "debug-open-step1-nav.png", fullPage: true });
      throw err;
    }

    logger.info(`Frames tras navegar: ${page.frames().map(f => f.url()).join(" | ")}`);

    // ── 2. Encontrar el frame del formulario ──────────────────────────────────
    // El form tiene AMBOS: instance/assignment Y var/choices/open
    let formFrame: Frame | undefined;
    const formDeadline = Date.now() + 20_000;
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
      throw new Error("Form Search Incidents no encontrado en ningun frame tras 20s");
    }
    logger.info(`Form en: ${formFrame.url()}`);

    // ── 3. Llenar el formulario: solo checkbox Open, sin grupo ni fechas ──────
    // Sin filtro de grupo = exporta todos los grupos (PEXA + CECOR + resto)
    // El upload filtra por group=PEXA,CECOR
    await formFrame.locator('[id="var/choices/open"]')
      .evaluate((el) => (el as HTMLInputElement).click());
    logger.info("Form llenado: Open (todos los grupos, sin rango de fechas)");

    // ── 4. Clic en Search ─────────────────────────────────────────────────────
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

    // ── 5. Esperar cwc_listdetail.jsp (resultados) ────────────────────────────
    logger.info("Esperando cwc_listdetail.jsp (hasta 120s — puede ser grande)...");
    const listDetailFrame = await waitForFrame(page, "cwc_listdetail", 120_000);
    if (!listDetailFrame) {
      await page.screenshot({ path: "debug-open-step3-nolist.png", fullPage: true });
      throw new Error("cwc_listdetail.jsp no aparecio en 120s");
    }
    logger.info(`Resultados en: ${listDetailFrame.url()}`);
    await page.waitForTimeout(2_000);

    // ── 6. More -> Export en el frame de resultados ───────────────────────────
    await exportCurrentViewToCsv(page, dest, listDetailFrame);
    logger.info("Descarga de incidentes abiertos completada");
  } finally {
    await session.close();
  }
}

export { main as downloadOpen };

// Ejecutar solo cuando se invoca directamente (no cuando se importa)
if (process.argv[1]?.replace(/\\/g, "/").endsWith("download-open.ts") ||
    process.argv[1]?.replace(/\\/g, "/").endsWith("download-open.js")) {
  main().catch((err) => {
    logger.error("Error descargando incidentes abiertos", { err: String(err) });
    process.exit(1);
  });
}
