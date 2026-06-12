import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { openHpsmSession, clearSession } from "./session.js";

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

    // ── 4. Extraer datos del grid ExtJS en list.do?thread=1 ─────────────────
    // More→Export desde index.do usa el template servidor (columnas fijas sin
    // Assignment Group). En cambio, el grid en list.do?thread=1 YA muestra las
    // columnas correctas; las leemos directamente del DOM y escribimos el CSV.
    const listFrame = page.frames().find(f => f.url().includes("list.do") && f.url().includes("thread=1"))
      ?? page.frames().find(f => f.url().includes("list.do"));
    if (!listFrame) {
      await page.screenshot({ path: "debug-open-nolistframe.png", fullPage: true });
      throw new Error("Queue list frame (list.do) no encontrado tras 40s");
    }
    logger.info(`Leyendo grid desde frame: ${listFrame.url()}`);

    // ── 4a. Cargar TODOS los registros en el store (el grid pagina a ~50) ────
    // PEXA/CECOR pueden no estar en la página 1; pedimos al store el total.
    const totalRegistros = await listFrame.evaluate(() =>
      new Promise<number>((resolve, reject) => {
        // tsx/esbuild envuelve funciones nombradas con __name, que no existe en el browser
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__name = (window as any).__name ?? ((fn: unknown) => fn);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Ext = (window as any).Ext as any;
        if (!Ext?.ComponentMgr) { reject(new Error("Ext.ComponentMgr no disponible")); return; }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let store: any = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Ext.ComponentMgr.all.each((c: any) => {
          if (c.getStore && c.getColumnModel) store = c.getStore();
        });
        if (!store) { reject(new Error("Store del grid no encontrado")); return; }
        const total: number = store.getTotalCount();
        if (store.getCount() >= total) { resolve(total); return; }
        store.load({
          params: { start: 0, limit: total },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: (_r: any, _o: any, success: boolean) => {
            success ? resolve(total) : reject(new Error("Store load falló"));
          },
        });
      }),
    );
    logger.info(`Store cargado: ${totalRegistros} registros totales`);
    await page.waitForTimeout(3_000); // dejar que el grid re-renderice todas las filas

    // ── 4b. Extraer headers y celdas alineados por índice ────────────────────
    // La primera columna (checkbox de selección) tiene header vacío: se incluye
    // como null para que header[i] corresponda a cell[i], y se omite del CSV.
    const gridData = await listFrame.evaluate((): { headers: (string | null)[]; rows: string[][] } => {
      const headers: (string | null)[] = [];
      document.querySelectorAll(".x-grid3-hd-inner").forEach(el => {
        const text = (el.textContent ?? "").replace(/Sortable$/, "").trim();
        headers.push(text || null);
      });

      const rows: string[][] = [];
      document.querySelectorAll(".x-grid3-row").forEach(rowEl => {
        const cells = rowEl.querySelectorAll(".x-grid3-cell-inner");
        rows.push(headers.map((_, i) => (cells[i]?.textContent ?? "").trim()));
      });

      return { headers, rows };
    });

    const keepIdx = gridData.headers.flatMap((h, i) => (h ? [i] : []));
    const colNames = keepIdx.map(i => gridData.headers[i] as string);

    logger.info(`Grid extraído: ${gridData.rows.length} filas — columnas: ${colNames.join(", ")}`);

    if (!colNames.length || !gridData.rows.length) {
      await page.screenshot({ path: "debug-open-gridvacio.png", fullPage: true });
      throw new Error(`Grid vacío en ${listFrame.url()} — headers encontrados: ${colNames.join(", ") || "ninguno"}`);
    }

    const csvLines = [
      colNames.map(h => `"${h.replace(/"/g, '""')}"`).join(","),
      ...gridData.rows.map(cells =>
        keepIdx.map(i => `"${(cells[i] ?? "").replace(/"/g, '""')}"`).join(","),
      ),
    ];
    writeFileSync(dest, csvLines.join("\n"), "utf-8");
    logger.info(`CSV guardado en ${dest} (${gridData.rows.length} filas)`);
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
