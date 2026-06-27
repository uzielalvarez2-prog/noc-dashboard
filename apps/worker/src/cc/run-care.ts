import "dotenv/config";
import { syncCare, isCareConfigured } from "../sync/care.js";
import { db } from "../sync/incidents.js";

/**
 * Corre la ingesta CARE una vez (manual). Requiere CC_* + (CC_TOTP_SECRET o CC_TOTP)
 * y DATABASE_URL apuntando a la rama de Neon.
 *   npx tsx src/cc/run-care.ts
 */
async function main() {
  if (!isCareConfigured()) {
    console.error("Falta configuración CC (CC_USER/CC_PASSWORD y CC_TOTP_SECRET o CC_TOTP).");
    process.exit(1);
  }
  const res = await syncCare();
  console.log("Resultado syncCare:", res);

  // Verificación: cuántas filas CARE quedaron en la DB.
  const [open, closed] = await Promise.all([
    db.openIncident.count({ where: { incidentId: { startsWith: "IMCARE" } } }),
    db.closedIncident.count({ where: { incidentId: { startsWith: "IMCARE" } } }),
  ]);
  console.log(`En DB ahora → OpenIncident CARE: ${open}, ClosedIncident CARE: ${closed}`);
  await db.$disconnect();
}

main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
