import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * Sube un CSV descargado de HPSM al endpoint del dashboard.
 *
 * @param csvPath   Ruta local al archivo CSV
 * @param groups    Grupo(s) a filtrar, separados por coma: "PEXA" o "PEXA,CECOR"
 */
export async function uploadCsv(csvPath: string, groups: string, clearOpen = false): Promise<void> {
  const content = readFileSync(csvPath);
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([content], { type: "text/csv" }),
    basename(csvPath),
  );
  formData.append("group", groups);
  if (clearOpen) formData.append("clearOpen", "true");

  const url = `${config.dashboardUrl}/api/incidents/upload`;
  logger.info(`Subiendo CSV al dashboard`, { url, groups, file: basename(csvPath) });

  const res = await fetch(url, {
    method: "POST",
    headers: { "x-internal-key": config.internalApiKey },
    body: formData,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Upload falló [${res.status}]: ${text.slice(0, 500)}`);
  }
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text) as Record<string, unknown>; } catch { /* respuesta no-JSON */ }
  logger.info("Upload completado", data);
}
