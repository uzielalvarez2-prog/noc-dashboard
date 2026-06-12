// Carga DATABASE_URL desde .env.local o .env (ejecutar desde apps/web).
const { existsSync } = require("node:fs");

for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) {
    process.loadEnvFile(f);
    break;
  }
}

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL no definido. Crea apps/web/.env.local con la cadena de conexion " +
      "(copiala de la otra PC o de Vercel > Settings > Environment Variables)."
  );
  process.exit(1);
}

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

module.exports = { db: new PrismaClient({ adapter }) };
