import { writeFileSync } from "node:fs";
import { logger } from "./logger.js";
import { openHpsmSession, clearSession } from "./session.js";
import { IM_REGEX } from "./hpsm-incident.js";
import { cerrarIncidente, type CierreResult, type ModoCierre } from "./cerrar-incidente.js";

/**
 * Job hijo del scheduler (vía runJob, igual que run-im-estatus): serializado
 * con las demás corridas de HPSM por el login único.
 *
 * Entrada (env):
 *   CERRAR_LIST   IMs separados por coma. Cada uno puede traer su template con
 *                 "IM=template": "IMIECG000699=*A TX SINC,IMATRG000098=*B ONT APAGADA".
 *                 Sin "=", usa CERRAR_TEMPLATE como template por defecto.
 *   CERRAR_TEMPLATE  Template por defecto para los IMs sin uno propio.
 *   CERRAR_MODO   "verificar" (default, dry-run) | "aplicar" | "cerrar".
 *   CERRAR_OUT    Ruta del JSON de resultados (se reescribe tras cada IM).
 */

interface Item {
  im: string;
  template: string;
}

function parsearLista(raw: string, templatePorDefecto: string): Item[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((par) => {
      const eq = par.indexOf("=");
      const im = (eq >= 0 ? par.slice(0, eq) : par).trim().toUpperCase();
      const template = (eq >= 0 ? par.slice(eq + 1) : templatePorDefecto).trim();
      return { im, template };
    })
    .filter((it) => IM_REGEX.test(it.im));
}

async function main(): Promise<void> {
  const out = process.env.CERRAR_OUT;
  if (!out) throw new Error("CERRAR_OUT requerido");

  const modoRaw = (process.env.CERRAR_MODO ?? "verificar").trim();
  const modo: ModoCierre =
    modoRaw === "cerrar" || modoRaw === "aplicar" ? (modoRaw as ModoCierre) : "verificar";

  const items = parsearLista(process.env.CERRAR_LIST ?? "", process.env.CERRAR_TEMPLATE ?? "");

  const resultados: CierreResult[] = [];
  const guardar = () => writeFileSync(out, JSON.stringify(resultados));
  guardar();

  if (items.length === 0) {
    logger.warn("run-cerrar: lista vacía tras validar — nada que hacer");
    return;
  }
  // Salvaguarda: cerrar de verdad requiere activarlo explícito. Si CERRAR_MODO
  // viniera mal, se cae a "verificar" arriba; aquí solo se registra qué modo es.
  logger.info(`run-cerrar: ${items.length} IMs en modo "${modo}"`);

  clearSession();
  const session = await openHpsmSession();
  try {
    for (const { im, template } of items) {
      const r = await cerrarIncidente(session.page, im, template, modo);
      resultados.push(r);
      guardar();
      logger.info(`run-cerrar ${im}: ${r.resultado} — ${r.mensaje}`);
    }
  } finally {
    await session.close();
  }

  const ok = resultados.filter((r) => r.ok).length;
  logger.info(`run-cerrar: fin — ${ok}/${resultados.length} OK (modo ${modo})`);
}

main().catch((err) => {
  logger.error("Error en run-cerrar", { err: String(err) });
  process.exit(1);
});
