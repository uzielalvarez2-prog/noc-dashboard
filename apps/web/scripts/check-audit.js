// Historial de cargas (bitacora) de los ultimos 3 dias + estado del usuario scraper-bot.
// Uso (desde apps/web):  node scripts/check-audit.js
const { db } = require("./db-env.js");

(async () => {
  const bot = await db.user.findUnique({ where: { id: "scraper-bot" } });
  console.log(
    bot
      ? "Usuario scraper-bot: OK (la bitacora registra las cargas del scraper)"
      : "Usuario scraper-bot: NO EXISTE — las cargas del scraper NO quedan en bitacora. Correr: node scripts/create-scraper-bot.js"
  );
  console.log("");

  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const logs = await db.auditLog.findMany({
    where: { action: { startsWith: "IMPORT" }, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { action: true, userId: true, createdAt: true, metadata: true },
  });

  for (const l of logs) {
    const m = l.metadata || {};
    const local = l.createdAt.toLocaleString("es-MX", { timeZone: "America/Mexico_City" });
    const who = l.userId === "scraper-bot" ? "scraper" : "manual";
    console.log(
      `${local} | ${l.action} | ${who} | filas=${m.totalRows ?? "?"} ins=${m.inserted ?? "?"} | ${m.filename ?? ""}`
    );
  }
  console.log(`\nTotal: ${logs.length} cargas en 3 dias`);

  await db.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
