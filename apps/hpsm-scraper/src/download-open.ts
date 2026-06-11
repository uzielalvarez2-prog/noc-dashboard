import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { openHpsmSession, exportCurrentViewToCsv, clearSession } from "./session.js";

const FAVORITES_QUEUE = "All Open Incidents CARE";

/** Espera a que aparezca el botón "More" en cualquier frame — señal de que la vista está lista. */
async function waitForMoreButton(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        const n = await frame.locator(':text-is("More")').count();
        if (n > 0) {
          logger.info(`More button detectado en: ${frame.url()}`);
          return true;
        }
      } catch { /* frame stale, ignorar */ }
    }
    await page.waitForTimeout(1_000);
  }
  return false;
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

    // ── 3. Esperar que cargue la lista (buscar botón "More" en cualquier frame) ──
    logger.info("Esperando que cargue la vista de incidentes (hasta 120s)...");
    await page.waitForTimeout(2_000);
    logger.info(`Frames tras click: ${page.frames().map(f => f.url()).join(" | ")}`);
    await page.screenshot({ path: "debug-open-step2-afterclick.png", fullPage: true });

    const listLoaded = await waitForMoreButton(page, 120_000);
    if (!listLoaded) {
      await page.screenshot({ path: "debug-open-step2-nolist.png", fullPage: true });
      throw new Error("La vista de incidentes no cargó (botón More no apareció en 120s)");
    }
    await page.waitForTimeout(2_000);
    logger.info(`Frames activos: ${page.frames().map(f => f.url()).join(" | ")}`);
    await page.screenshot({ path: "debug-open-step2-list.png", fullPage: true });

    // ── 4. More → Export to Text File → CSV → ✓ ─────────────────────────────
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
