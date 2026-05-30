import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Carga primero .env y luego .env.local (local tiene prioridad)
config({ path: ".env" });
config({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
