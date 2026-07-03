import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { openHpsmSession, clearSession, exportCurrentViewToCsv } from "./session.js";

const FAVORITES_QUEUE = "All Open Incidents CARE";

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
    const deadline = Date.now() + 45_000;
    let lastExpand = 0;
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
      if (!queueClicked) {
        // El login fresco hereda el estado del panel de navegación de la última
        // sesión humana: si Favorites quedó colapsado (p.ej. quedó activa otra
        // sección como Miscellaneous), el favorito nunca aparece. Re-clickear
        // la cabecera cada ~6s hasta que la sección abra.
        if (Date.now() - lastExpand > 6_000) {
          lastExpand = Date.now();
          for (const frame of page.frames()) {
            const favLink = frame.locator('text="Favorites and Dashboards"').first();
            if (await favLink.isVisible({ timeout: 500 }).catch(() => false)) {
              logger.info("Favorito no visible — re-expandiendo Favorites and Dashboards...");
              await favLink.click({ force: true, timeout: 2_000 }).catch(() =>
                favLink.evaluate((el) => (el as HTMLElement).click()).catch(() => {}),
              );
              break;
            }
          }
        }
        await page.waitForTimeout(1_000);
      }
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

    // ── 4. More → Export to Text File (igual que el proceso manual) ─────────
    // El grid/store solo expone ~50 registros (paginación servidor de HPSM);
    // el export del servidor trae TODO el queue (~2,400 filas) con Assignment
    // Group incluido. La descarga tarda ~40-60s; el helper espera hasta 5 min.
    const listFrame = page.frames().find(f => f.url().includes("list.do") && f.url().includes("thread=1"))
      ?? page.frames().find(f => f.url().includes("list.do"));
    if (!listFrame) {
      await page.screenshot({ path: "debug-open-nolistframe.png", fullPage: true });
      throw new Error("Queue list frame (list.do) no encontrado tras 40s");
    }
    await exportCurrentViewToCsv(page, dest, listFrame, true);
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
