import { join } from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { downloadClosed } from "./download-closed.js";
import { DescargaAgotada, downloadWithRetry } from "./closed-retry.js";
import { uploadCsv } from "./upload.js";
import { sendWhatsappAlert } from "./alert.js";

// La cuenta ualvarez es compartida humano/bot: 2026-07-12 y 07-13 el login falló
// justo 14:02-14:15 (13 min) los dos días, coincidiendo con uso humano de la cuenta
// a esa hora. run-closed solo corre 1 vez al día en cada horario (14:02 / 22:00) —
// a diferencia de run-open (cron cada 5 min), si falla aquí no hay otra oportunidad
// hasta el siguiente horario programado, así que hay que insistir. La política de
// reintentos (presupuesto de tiempo, límite de sesiones aparte) vive en closed-retry.ts.

/** HH:mm en hora de CDMX (el contenedor ya corre con TZ=America/Mexico_City, pero no se depende de eso). */
function hhmm(ms: number): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

async function alertarFallo(startedAt: number, err: unknown): Promise<void> {
  const mins = Math.max(1, Math.round((Date.now() - startedAt) / 60_000));
  const agotada = err instanceof DescargaAgotada ? err : null;
  // Solo la primera línea y sin códigos ANSI: los errores de Playwright traen un
  // "call log" multilínea que en WhatsApp es puro ruido.
  const motivo = (agotada?.ultimoError ?? (err instanceof Error ? err : new Error(String(err))))
    .message.replace(/\u001b\[[0-9;]*m/g, "")
    .split("\n")[0]
    .trim();
  const lineas = [
    `⚠️ NOC Dashboard — falló la carga de incidentes CERRADOS (${config.closed.group})`,
    `Corrida de las ${hhmm(startedAt)}: no se cargaron datos nuevos al dashboard (duró ${mins} min).`,
  ];
  if (agotada) {
    lineas.push(
      `Intentos: ${agotada.intentos}` +
        (agotada.bloqueosSesion > 0 ? ` (${agotada.bloqueosSesion} por límite de sesiones)` : ""),
    );
  }
  lineas.push(`Último error: ${motivo.slice(0, 300)}`);
  lineas.push("Se recupera en la siguiente corrida programada o subiendo el CSV a mano.");
  await sendWhatsappAlert(lineas.join("\n"));
}

async function run(): Promise<void> {
  const startedAt = Date.now();
  const dest = join(
    config.downloadDir,
    `closed-incidents-${new Date(startedAt).toISOString().slice(0, 10)}.csv`,
  );

  logger.info("=== run-closed: inicio ===");
  try {
    await downloadWithRetry({
      attempt: (listWaitMs) => downloadClosed({ listWaitMs }),
      startedAt,
      budgetMs: config.closed.budgetMin * 60_000,
      listWaitMs: config.closed.listWaitMin * 60_000,
    });

    logger.info(`Subiendo incidentes cerrados al dashboard (${config.closed.group})...`);
    await uploadCsv(dest, config.closed.group, "closed");
  } catch (err) {
    // Se avisa ANTES de propagar: el proceso sale con exit 1 y el scheduler solo lo loguea.
    await alertarFallo(startedAt, err);
    throw err;
  }

  logger.info("=== run-closed: completado ===");
}

run().catch((err) => {
  logger.error("Error en run-closed", { err: String(err) });
  process.exit(1);
});
