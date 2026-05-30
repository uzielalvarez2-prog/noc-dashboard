import "dotenv/config";
import path from "path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  // Reusa el mismo schema que apps/web
  schema: path.resolve(__dirname, "../web/prisma/schema.prisma"),
  migrations: {
    path: path.resolve(__dirname, "../web/prisma/migrations"),
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
