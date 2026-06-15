import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash("noc-admin-2026", 12);
  const admin = await db.user.upsert({
    where: { email: "admin@noc.local" },
    update: { passwordHash, name: "NOC Admin", role: "ADMIN" },
    create: {
      email: "admin@noc.local",
      passwordHash,
      name: "NOC Admin",
      lastName: "",
      username: "admin",
      expediente: "",
      role: "ADMIN",
    },
  });
  console.log("Admin OK:", admin.email, "| usuarios totales:", await db.user.count());
}

main()
  .catch((e) => {
    console.error("Seed error:", e?.message ?? e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
