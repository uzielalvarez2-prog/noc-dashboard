// Crea el usuario "scraper-bot" para que las cargas del scraper queden en la bitacora.
// Sin este usuario, el AuditLog de cada carga falla por llave foranea y se pierde en silencio.
// Idempotente (upsert): correrlo dos veces no duplica nada.
// Uso (desde apps/web):  node scripts/create-scraper-bot.js
const { db } = require("./db-env.js");

(async () => {
  const user = await db.user.upsert({
    where: { id: "scraper-bot" },
    update: {},
    create: {
      id: "scraper-bot",
      email: "scraper-bot@noc.internal",
      // "!" no es un hash bcrypt valido — imposible iniciar sesion con esta cuenta
      passwordHash: "!",
      name: "Scraper",
      lastName: "Bot",
      username: "scraper-bot",
    },
  });
  console.log("Usuario listo:", user.id, "|", user.email, "| rol:", user.role);
  await db.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
