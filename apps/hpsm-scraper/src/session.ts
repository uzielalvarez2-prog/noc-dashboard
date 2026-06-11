import { chromium, type Browser, type Page, type BrowserContext, type Frame } from "playwright";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";

export interface HpsmSession {
  browser: Browser;
  page: Page;
  close(): Promise<void>;
}

const COOKIE_FILE = join(process.cwd(), "hpsm-cookies.json");

/** Elimina el archivo de cookies — fuerza login fresco en la siguiente apertura de sesión. */
export function clearSession(): void {
  try {
    unlinkSync(COOKIE_FILE);
    logger.info("Cookie file eliminado — próximo run hará login fresco");
  } catch {
    // no existía, no pasa nada
  }
}

async function saveCookies(context: BrowserContext): Promise<void> {
  const cookies = await context.cookies();
  writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  logger.info("Cookies de sesión guardadas");
}

async function tryRestoreSession(context: BrowserContext, page: Page): Promise<boolean> {
  if (!existsSync(COOKIE_FILE)) return false;
  try {
    const cookies = JSON.parse(readFileSync(COOKIE_FILE, "utf-8"));
    await context.addCookies(cookies);
    await page.goto(config.hpsm.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    const onLogin = await page.locator("#loginBtn").isVisible({ timeout: 3_000 }).catch(() => false);
    const limitError = await page.locator("text=Maximum active logins").isVisible({ timeout: 1_000 }).catch(() => false);
    if (!onLogin && !limitError) {
      logger.info("Sesión restaurada desde cookies (sin nuevo login)");
      return true;
    }
    logger.info("Cookies expiradas — se hará login nuevo");
    return false;
  } catch {
    logger.info("Error leyendo cookies — se hará login nuevo");
    return false;
  }
}

export async function openHpsmSession(): Promise<HpsmSession> {
  const browser = await chromium.launch({ headless: !config.headed });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const restored = await tryRestoreSession(context, page);

  if (!restored) {
    logger.info(`Navegando a HPSM: ${config.hpsm.url}`);
    await page.goto(config.hpsm.url, { waitUntil: "domcontentloaded" });

    await page.locator("#LoginUsername").waitFor({ state: "visible", timeout: 30_000 });
    await page.locator("#LoginUsername").fill(config.hpsm.user);
    await page.locator("#LoginPassword").fill(config.hpsm.password);
    await page.locator("#loginBtn").click();
    await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
    await page.waitForTimeout(2_000); // dar tiempo a ExtJS para inicializar

    const limitError = await page.locator("text=Maximum active logins").first().isVisible().catch(() => false);
    if (limitError) {
      await browser.close();
      throw new Error("HPSM: límite de sesiones activas superado — pedir al admin que libere las sesiones");
    }
    const stillOnLogin = await page.locator("#loginBtn").isVisible().catch(() => false);
    if (stillOnLogin) {
      await browser.close();
      throw new Error("HPSM: login fallido — credenciales inválidas");
    }

    logger.info("Login HPSM completado");
    await saveCookies(context);
  }

  return {
    browser,
    page,
    close: async () => {
      // Logout de HPSM — libera la sesión del servidor y evita acumular logins activos
      try {
        const logoutUrl = await page.evaluate(() =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).cwc?.logoutCleanupJsp as string | undefined ?? null
        ).catch(() => null);
        if (logoutUrl) {
          logger.info(`Logout HPSM: ${logoutUrl}`);
          await page.goto(logoutUrl, { timeout: 10_000, waitUntil: "domcontentloaded" }).catch(() => {});
        } else {
          logger.warn("logoutCleanupJsp no encontrado — sesión HPSM puede quedar activa");
        }
      } catch { /* ignorar */ }
      // No guardamos cookies — la sesión ya fue cerrada en el servidor
      await browser.close();
      logger.info("Sesión cerrada");
    },
  };
}

/**
 * Ejecuta el menú "More → Export to text file → CSV → ✔" sobre la vista actual
 * y espera la descarga, guardándola en `destPath`.
 */
/**
 * @param contentFrame  Frame donde vive la lista de resultados. Si se omite se
 *                      busca automáticamente en todos los frames de la página.
 */
export async function exportCurrentViewToCsv(
  page: Page,
  destPath: string,
  contentFrame?: Frame,
): Promise<void> {
  // Buscar el botón "More" en el frame indicado o en todos los frames
  const framesToSearch = contentFrame
    ? [contentFrame, page.mainFrame()]
    : page.frames();

  let moreClicked = false;
  for (const frame of framesToSearch) {
    try {
      const moreText = frame.locator(':text-is("More")').first();
      const moreBtn = moreText.locator(
        'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " x-btn ")][1]',
      );
      await moreBtn.waitFor({ state: "attached", timeout: 8_000 });
      await moreBtn.evaluate((el) => (el as HTMLElement).click());
      moreClicked = true;
      logger.info(`More button encontrado en frame: ${frame.url()}`);
      break;
    } catch {
      // no estaba en este frame, intentar el siguiente
    }
  }
  if (!moreClicked) {
    await page.screenshot({ path: "debug-export-more.png", fullPage: true });
    throw new Error("More button no encontrado en ningún frame");
  }

  await page.waitForTimeout(1_500);

  // "Export to Text File" aparece como menú flotante de ExtJS — buscar en todos los frames
  // Usamos match parcial ("text=") para tolerar whitespace en el texto del menú
  let exportClicked = false;
  for (const frame of page.frames()) {
    const opt = frame.locator("text=Export to Text File").first();
    if (await opt.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await opt.evaluate((el) => (el as HTMLElement).click());
      exportClicked = true;
      logger.info(`Export to Text File clickeado en frame: ${frame.url()}`);
      break;
    }
  }
  if (!exportClicked) {
    await page.screenshot({ path: "debug-export-menu.png", fullPage: true });
    throw new Error('"Export to Text File" no visible en ningún frame');
  }

  // Esperar a que aparezca el diálogo de export (frame detail.do)
  await page.waitForTimeout(2_000);

  // Screenshot para diagnóstico del diálogo
  await page.screenshot({ path: "debug-export-dialog.png", fullPage: true });

  // Seleccionar "Comma Separated Value (CSV)" en el diálogo de export.
  // HPSM recuerda el último delimitador — puede quedar en "Tab" entre corridas.
  for (const frame of page.frames()) {
    const changed = await frame.evaluate(() => {
      const spans = Array.from(document.querySelectorAll("span, label, td"));
      const label = spans.find(el => el.textContent?.includes("Comma Separated Value"));
      if (!label) return false;
      const row = label.closest("tr") ?? label.parentElement;
      const radio = row?.querySelector<HTMLInputElement>('input[type="radio"]');
      if (radio) { radio.click(); return true; }
      return false;
    }).catch(() => false);
    if (changed) { logger.info("Delimitador CSV seleccionado"); break; }
  }

  // El botón de confirmar es img[src*="tok"] (✓ verde).
  // CRÍTICO: usar .click({ force:true }) — ExtJS panels intercept pointer events en ese frame.
  // Iniciar downloadPromise ANTES del click para no perder el evento.
  const downloadPromise = page.waitForEvent("download", { timeout: 300_000 });

  // Confirmar con img[src*="tok"].
  // NO usar .click({ force:true }): los paneles ExtJS interceptan a nivel de coordenadas de browser.
  // Usar evaluate para llamar el handler directamente en el nodo (bypass de hit-testing).
  let confirmed = false;
  for (const frame of page.frames()) {
    const tok = frame.locator('img[src*="tok"]').first();
    if (await tok.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await tok.evaluate((el) => (el as HTMLElement).click());
      confirmed = true;
      logger.info(`Confirm (tok) evaluate-clicked en frame: ${frame.url()}`);
      break;
    }
  }
  if (!confirmed) {
    for (const frame of page.frames()) {
      const btn = frame.locator([
        'button[title="OK" i]', 'img[alt="OK" i]', 'img[src*="check" i]',
        'img[src*="ok" i]', 'td[title="OK" i]',
      ].join(", ")).first();
      if (await btn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await btn.evaluate((el) => (el as HTMLElement).click());
        confirmed = true;
        logger.info(`Confirm fallback evaluate-clicked en frame: ${frame.url()}`);
        break;
      }
    }
  }
  if (!confirmed) {
    logger.warn("Confirm button no encontrado — intentando Enter");
    await page.keyboard.press("Enter");
  }
  // Screenshot post-confirm para ver si HPSM inicia descarga
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: "debug-export-postconfirm.png", fullPage: true });

  logger.info("Esperando descarga (puede tardar varios minutos)...");
  const download = await downloadPromise;
  await download.saveAs(destPath);
  logger.info(`CSV guardado en ${destPath}`);
}
