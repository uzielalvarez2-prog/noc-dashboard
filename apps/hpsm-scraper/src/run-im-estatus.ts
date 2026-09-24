import { writeFileSync } from "node:fs";
import { logger } from "./logger.js";
import { openHpsmSession, clearSession } from "./session.js";
import { consultarIncidente, IM_REGEX, type ImEstatusResult } from "./hpsm-incident.js";

/**
 * Job hijo del scheduler (vía runJob, igual que run-open/run-sisa): así queda
 * serializado con las demás corridas que usan el login único de HPSM.
 *
 * Entrada: IM_LIST (IMs separados por coma). Salida: IM_ESTATUS_OUT, un JSON
 * que se reescribe tras cada IM para que el server reporte avance parcial.
 */
async function main(): Promise<void> {
  const out = process.env.IM_ESTATUS_OUT;
  if (!out) throw new Error("IM_ESTATUS_OUT requerido");
  const ims = (process.env.IM_LIST ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => IM_REGEX.test(s));

  const resultados: ImEstatusResult[] = [];
  const guardar = () => writeFileSync(out, JSON.stringify(resultados));
  guardar();

  clearSession();
  const session = await openHpsmSession();
  try {
    for (const im of ims) {
      resultados.push(await consultarIncidente(session.page, im));
      guardar();
    }
  } finally {
    await session.close();
  }
  logger.info(`run-im-estatus: ${resultados.length} IMs consultados`);
}

main().catch((err) => {
  logger.error("Error consultando estatus de IMs", { err: String(err) });
  process.exit(1);
});
