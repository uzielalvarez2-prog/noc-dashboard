import { chromium } from "playwright";
import { config } from "./config.js";
import { logger } from "./logger.js";

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  await page.goto(config.hpsm.url, { waitUntil: "domcontentloaded" });
  await page.locator("#LoginUsername").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#LoginUsername").fill(config.hpsm.user);
  await page.locator("#LoginPassword").fill(config.hpsm.password);
  await Promise.all([page.waitForLoadState("networkidle"), page.locator("#loginBtn").click()]);

  const errorMsg = await page.locator("text=Maximum active logins").first().isVisible().catch(() => false);
  if (errorMsg) { logger.error("SESIONES LIMITADAS — pedir al admin que limpie"); await browser.close(); return; }

  logger.info("Login OK");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "diag-logged-in.png", fullPage: false });
  logger.info("Screenshot guardado: diag-logged-in.png");

  // Log all frames
  for (const [i, frame] of page.frames().entries()) {
    logger.info(`Frame ${i}: url=${frame.url()}`);
    try {
      const logoutEl = frame.locator(':text-is("Logout")').first();
      const visible = await logoutEl.isVisible({ timeout: 1000 }).catch(() => false);
      if (visible) {
        logger.info(`  → Logout ENCONTRADO en frame ${i} (${frame.url()})`);
        const tag = await logoutEl.evaluate((el) => el.tagName).catch(() => "?");
        const href = await logoutEl.evaluate((el) => (el as HTMLAnchorElement).href ?? "").catch(() => "");
        logger.info(`  → tag=${tag} href=${href}`);
      }
    } catch { continue; }
  }

  // Test logout con mouse.click
  let loggedOut = false;
  for (const frame of page.frames()) {
    try {
      const el = frame.locator(':text-is("Logout")').first();
      const box = await el.boundingBox().catch(() => null);
      if (box) {
        logger.info(`mouse.click en Logout (${Math.round(box.x + box.width/2)}, ${Math.round(box.y + box.height/2)})`);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(3_000);
        loggedOut = true;
        break;
      }
    } catch { continue; }
  }

  await page.screenshot({ path: "diag-after-logout.png", fullPage: false });
  const backToLogin = await page.locator("#loginBtn").isVisible().catch(() => false);
  logger.info(`Logout ejecutado: ${loggedOut} | ¿Redirigió al login?: ${backToLogin}`);
  if (!backToLogin) logger.warn("SESIÓN NO LIBERADA — página sigue mostrando el dashboard");

  await browser.close();
}

main().catch((e) => { logger.error(String(e)); process.exit(1); });
