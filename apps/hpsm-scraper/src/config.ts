import "dotenv/config";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Variable de entorno requerida: ${name}`);
  return val;
}

/**
 * Lee una variable de entorno a prueba de los dos accidentes que ya nos
 * costaron un deploy al configurar Manto en Railway:
 *
 *  1. El NOMBRE llega con espacios/tabs invisibles pegados (p. ej. se guardó
 *     "MANTO_PASSWORD\t " al pegarlo en el panel): process.env.MANTO_PASSWORD
 *     da undefined aunque el panel muestre la variable. Se busca también por
 *     nombre normalizado.
 *  2. El VALOR llega entrecomillado, porque entrecomillar es el workaround
 *     habitual cuando un valor trae caracteres especiales.
 */
function leerEnv(name: string): string {
  let raw = process.env[name];
  if (raw === undefined) {
    // Búsqueda tolerante: ignora espacios/tabs alrededor del nombre.
    const buscado = name.trim().toUpperCase();
    for (const [k, v] of Object.entries(process.env)) {
      if (k.trim().toUpperCase() === buscado) {
        raw = v;
        break;
      }
    }
  }
  const t = (raw ?? "").trim();
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
    user: leerEnv("MANTO_USER"),
    password: leerEnv("MANTO_PASSWORD"),
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
