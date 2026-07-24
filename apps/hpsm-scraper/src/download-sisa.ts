import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Frame, Page } from "playwright";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { openHpsmSession, exportCurrentViewToCsv, clearSession } from "./session.js";

/**
 * Flujo HPSM (confirmado con diagnose-sisa.ts el 2026-07-24):
 *  1. Incident Management → Search Incident Task
 *  2. Llenar form: Assignment Group=PEXA, checkbox "Open"
 *  3. Clic en botón toolbar "Search"
 *  4. Esperar frame cwc_listdetail.jsp / list.do (resultados)
 *  5. More → Export to Text File → CSV en ese frame
 *
 * Campos del form (name/id reales, confirmados por diagnose-sisa.ts):
 *   instance/assignment (id X14)  → Assignment Group
 *   id="var/choices/open"         → Checkbox "Open"
 *   instance/vendor.ticket        → columna Vendor Ticket (viene en el export)
 *   instance/vendor               → columna Vendor (CASE)
 */
async function waitForFrame(page: Page, urlPart: string, timeoutMs: number): Promise<Frame | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const f = page.frames().find((fr) => fr.url().includes(urlPart));
    if (f) return f;
    await page.waitForTimeout(1_000);
  }
  return undefined;
}

async function main(): Promise<void> {
  mkdirSync(config.downloadDir, { recursive: true });
  const dest = join(config.downloadDir, "sisa-tickets.csv");

  clearSession();

  const session = await openHpsmSession();
  try {
    const { page } = session;

    // ── 0. Limpieza de estado residual (igual que download-closed.ts) ───────
    const sessionWarnVisible = await page.locator("text=Your inactive session").isVisible({ timeout: 5_000 }).catch(() => false);
    if (sessionWarnVisible) {
      await page.locator(".x-window button").filter({ hasText: "OK" }).first()
        .click({ force: true, timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(1_000);
    }
    const backVisible = await page.locator("text=Back").first().isVisible({ timeout: 2_000 }).catch(() => false);
    if (backVisible) {
      await page.locator("text=Back").first().click({ force: true });
      await page.waitForTimeout(1_000);
    }
    await page.locator(".ext-el-mask").first().waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});

    // ── 1. Navegación: Incident Management → Search Incident Task ───────────
    try {
      const incMgmt = page.locator("text=Incident Management").first();
      await incMgmt.waitFor({ state: "visible", timeout: 15_000 });
      await incMgmt.click({ timeout: 15_000 });
      await page.waitForTimeout(1_000);

      const searchTask = page.locator("text=Search Incident Task").first();
      await searchTask.waitFor({ state: "visible", timeout: 10_000 });

      const newFramePromise = page.waitForEvent("frameattached", { timeout: 20_000 }).catch(() => null);
      await searchTask.click({ timeout: 10_000 });

      const newFrame = await newFramePromise;
      if (newFrame) logger.info(`Nuevo frame tras nav: ${newFrame.url()}`);
      await page.waitForTimeout(4_000);
    } catch (err) {
      await page.screenshot({ path: "debug-sisa-step1-menu.png", fullPage: true });
      throw err;
    }

    logger.info(`Frames tras navegar: ${page.frames().map((f) => f.url()).join(" | ")}`);

    // ── 2. Encontrar el frame que contiene el form (assignment + open) ──────
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
      await page.screenshot({ path: "debug-sisa-step2-noframe.png", fullPage: true });
      throw new Error("Form Search Incident Task no encontrado en ningún frame tras 60s");
    }
    logger.info(`Form en: ${formFrame.url()}`);

    // ── 3. Llenar el formulario ───────────────────────────────────────────────
    await formFrame.locator('[name="instance/assignment"]')
      .fill(config.closed.group, { force: true, timeout: 10_000 });

    await formFrame.locator('[id="var/choices/open"]')
      .evaluate((el) => (el as HTMLInputElement).click());

    await page.screenshot({ path: "debug-sisa-step2-filled.png", fullPage: true });
    logger.info(`Form llenado: Assignment=${config.closed.group}, Open`);

    // ── 4. Clic en botón Search del toolbar ───────────────────────────────────
    {
      let searchClicked = false;
      const orderedFrames = [formFrame, ...page.frames().filter((f) => f !== formFrame)];
      for (const frame of orderedFrames) {
        const n = await frame.locator(':text-is("Search")').count().catch(() => 0);
        if (n > 0) {
          await frame.locator(':text-is("Search")').first().evaluate((el) => (el as HTMLElement).click());
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

    // ── 5. Esperar frame cwc_listdetail.jsp (resultados) ─────────────────────
    logger.info("Esperando cwc_listdetail.jsp (hasta 90s)...");
    const listDetailFrame = await waitForFrame(page, "cwc_listdetail", 90_000);
    if (!listDetailFrame) {
      await page.screenshot({ path: "debug-sisa-step3-nolist.png", fullPage: true });
      throw new Error("cwc_listdetail.jsp no apareció en 90s — ¿0 resultados?");
    }
    logger.info(`Resultados en: ${listDetailFrame.url()}`);
    await page.waitForTimeout(2_000);

    // ── 6. More → Export en el frame de resultados ────────────────────────────
    await exportCurrentViewToCsv(page, dest, listDetailFrame);
    logger.info("Descarga de tickets SISA completada");
  } finally {
    await session.close();
  }
}

export { main as downloadSisa };

if (process.argv[1]?.replace(/\\/g, "/").endsWith("download-sisa.ts") ||
    process.argv[1]?.replace(/\\/g, "/").endsWith("download-sisa.js")) {
  main().catch((err) => {
    logger.error("Error descargando tickets SISA", { err: String(err) });
    process.exit(1);
  });
}
