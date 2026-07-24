import { chromium } from "playwright";
import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * Herramienta de diagnóstico ÚNICA VEZ — versión instrumentada con screenshots
 * en cada paso del login (el login de session.ts falló con "credenciales
 * inválidas" sin dar pistas de qué pasó realmente en pantalla).
 *
 * Guarda capturas en apps/hpsm-scraper/ (junto a este script):
 *   diag-01-antes-login.png   → justo después de cargar la página
 *   diag-02-form-lleno.png    → tras llenar usuario/contraseña
 *   diag-03-tras-click.png    → justo después de dar clic en el botón de login
 *   diag-04-resultado.png     → 5s después (ya sea logueado o con error visible)
 *
 * Uso:  npx tsx src/diagnose-sisa.ts
 */
async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  logger.info(`Navegando a HPSM: ${config.hpsm.url}`);
  await page.goto(config.hpsm.url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: "diag-01-antes-login.png", fullPage: true });
  logger.info("Screenshot: diag-01-antes-login.png");

  const userField = page.locator("#LoginUsername");
  const passField = page.locator("#LoginPassword");
  const loginBtn = page.locator("#loginBtn");

  const userVisible = await userField.isVisible({ timeout: 15_000 }).catch(() => false);
  logger.info(`Campo usuario visible: ${userVisible}`);
  if (!userVisible) {
    await page.screenshot({ path: "diag-error-nofield.png", fullPage: true });
    logger.error("No apareció el formulario de login — ver diag-error-nofield.png");
    await browser.close();
    return;
  }

  await userField.fill(config.hpsm.user);
  await passField.fill(config.hpsm.password);
  await page.screenshot({ path: "diag-02-form-lleno.png", fullPage: true });
  logger.info(`Screenshot: diag-02-form-lleno.png (usuario="${config.hpsm.user}", password length=${config.hpsm.password.length})`);

  await loginBtn.click();
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: "diag-03-tras-click.png", fullPage: true });
  logger.info("Screenshot: diag-03-tras-click.png");

  await page.waitForTimeout(5_000);
  await page.screenshot({ path: "diag-04-resultado.png", fullPage: true });
  logger.info("Screenshot: diag-04-resultado.png");

  const stillOnLogin = await loginBtn.isVisible().catch(() => false);
  const limitError = await page.locator("text=Maximum active logins").first().isVisible().catch(() => false);
  const bodyText = await page.locator("body").innerText().catch(() => "");

  logger.info("=== DIAGNÓSTICO ===", {
    stillOnLogin,
    limitError,
    urlActual: page.url(),
    fragmentoTexto: bodyText.slice(0, 300),
  });

  if (stillOnLogin) {
    logger.error("Sigue en pantalla de login tras el clic — revisa diag-03/diag-04 y el texto de error en pantalla");
  } else if (limitError) {
    logger.error("HPSM reporta límite de sesiones activas — pide al admin liberar sesiones");
  } else {
    logger.info("¡Login exitoso! Ahora navega MANUALMENTE en esta ventana a: Incident Management → Search Incident Task → Assignment Group=PEXA + Open → Search");
    logger.info("Este script seguirá escaneando el formulario cada 3s durante 3 minutos.");

    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(3_000);
      for (const frame of page.frames()) {
        let fields: { tag: string; name: string; id: string; type: string; label: string }[] = [];
        try {
          fields = await frame.evaluate(() => {
            const out: { tag: string; name: string; id: string; type: string; label: string }[] = [];
            document.querySelectorAll("input, select, textarea").forEach((el) => {
              const name = el.getAttribute("name") ?? "";
              const id = el.getAttribute("id") ?? "";
              const type = el.getAttribute("type") ?? el.tagName.toLowerCase();
              const row = el.closest("tr");
              const label = row?.textContent?.trim().slice(0, 60) ?? "";
              if (/assign|open|vendor|task|closed|status|company/i.test(name + " " + id + " " + label) && (name || id)) {
                out.push({ tag: el.tagName.toLowerCase(), name, id, type, label });
              }
            });
            return out;
          });
        } catch {
          continue;
        }
        for (const f of fields) {
          const key = `${frame.url()}|${f.name}|${f.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          logger.info("CAMPO ENCONTRADO", { frame: frame.url(), ...f });
        }
        if (frame.url().includes("cwc_listdetail") || frame.url().includes("list.do")) {
          const key = `RESULTFRAME|${frame.url()}`;
          if (!seen.has(key)) {
            seen.add(key);
            logger.info("FRAME DE RESULTADOS DETECTADO", { url: frame.url() });
          }
        }
      }
    }
  }

  logger.info("Diagnóstico terminado. Cerrando navegador...");
  await browser.close();
}

main().catch((err) => {
  logger.error("Error en diagnose-sisa", { err: String(err) });
  process.exit(1);
});
