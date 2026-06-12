// Frescura de datos: conteos y fecha de ultima carga por tabla.
// Uso (desde apps/web):  node scripts/check-data.js
const { db } = require("./db-env.js");

(async () => {
  const [openCount, openLast, closedCount, closedLast] = await Promise.all([
    db.openIncident.count(),
    db.openIncident.aggregate({ _max: { uploadedAt: true } }),
    db.closedIncident.count(),
    db.closedIncident.aggregate({ _max: { uploadedAt: true } }),
  ]);

  const fmt = (d) =>
    d ? d.toLocaleString("es-MX", { timeZone: "America/Mexico_City" }) : "(nunca)";

  console.log("Abiertos:", openCount, "| ultima carga:", fmt(openLast._max.uploadedAt));
  console.log("Cerrados:", closedCount, "| ultima carga:", fmt(closedLast._max.uploadedAt));

  // Muestra de campos clave: detecta cargas con columnas vacias del scraper
  const sample = await db.openIncident.findMany({
    take: 5,
    select: { incidentId: true, serviceId: true, state: true, district: true, assignee: true },
  });
  const empties = (f) => sample.filter((r) => !r[f]).length;
  console.log(
    `Muestra de 5 abiertos — vacios: servicio=${empties("serviceId")}/5, ` +
      `estado=${empties("state")}/5, distrito=${empties("district")}/5, asignado=${empties("assignee")}/5`
  );

  await db.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
