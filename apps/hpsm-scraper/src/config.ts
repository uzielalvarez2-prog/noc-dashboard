import "dotenv/config";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Variable de entorno requerida: ${name}`);
  return val;
}

/**
 * Lee una variable quitando comillas envolventes si las trae. Railway descarta
 * el valor de una variable cuyo contenido tiene `#` (lo toma como comentario),
 * y el workaround es guardarla entrecomillada — según cómo se capture, el valor
 * puede llegar con las comillas incluidas. Esto acepta ambas formas.
 */
function envSinComillas(name: string): string {
  const raw = process.env[name] ?? "";
  const t = raw.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

export const config = {
  hpsm: {
    url: process.env.HPSM_URL ?? "https://sm.cnoc.telmexit.com/sm/index.do?lang=en",
    user: requireEnv("HPSM_USER"),
    password: requireEnv("HPSM_PASSWORD"),
  },
  // Portal Manto (SISA Mantenimiento) — consulta de estatus bajo demanda, NO
  // vía requireEnv: scripts que no tocan Manto (run-open, run-closed, etc.)
  // no deben fallar si estas variables no están seteadas.
  manto: {
    url: process.env.MANTO_URL ?? "http://200.57.157.167/manto/jsp/AccesoSup.jsp?org=0",
    user: envSinComillas("MANTO_USER"),
    password: envSinComillas("MANTO_PASSWORD"),
  },
  downloadDir: process.env.DOWNLOAD_DIR ?? "C:\\Users\\Admin\\noc-csvs",
  closed: {
    group: process.env.HPSM_CLOSED_GROUP ?? "PEXA",
    startTime: process.env.HPSM_CLOSED_START_TIME ?? "07:00",
    endTime: process.env.HPSM_CLOSED_END_TIME ?? "22:10",
  },
  headed: process.env.HEADED === "true",
  dashboardUrl: process.env.DASHBOARD_URL ?? "http://localhost:3000",
  internalApiKey: requireEnv("INTERNAL_API_KEY"),
  // Puerto HTTP que expone el scraper para refrescos bajo demanda (ej. estatus SISA).
  port: Number(process.env.PORT ?? "8080"),
};
