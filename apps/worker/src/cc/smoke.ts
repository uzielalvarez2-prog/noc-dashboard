import "dotenv/config";
import { CcClient } from "./client.js";

/**
 * Prueba en vivo del CcClient. Requiere en el entorno:
 *   CC_USER, CC_PASSWORD y (CC_TOTP=<6 dígitos frescos>  ó  CC_TOTP_SECRET=<semilla>)
 *
 * Uso:  npx tsx src/cc/smoke.ts
 */
async function main() {
  const cc = new CcClient();

  console.log("ping:", await cc.ping());
  console.log("x-total-count:", await cc.getTotalCount());
  console.log("statuses:", await cc.getStatuses());

  const groups = await cc.getGroups();
  console.log("groups:", groups);

  const incidents = await cc.getIncidents();
  console.log(`incidents (feed del día): ${incidents.length}`);
  if (incidents[0]) {
    const i = incidents[0];
    console.log("  ej:", { number: i.number, status: i.problem_status, group: i.group, loc: i.location_code, svc: i.affected_service, company: i.company });
    console.log("  journal:", (await cc.getDetails(i.number)).slice(0, 3));
  }

  const open = await cc.getAllOpen();
  console.log(`abiertos (todos los grupos): ${open.length}`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
