import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const groups = await db.incident.groupBy({ by: ["status"], _count: { id: true } });
  const total = await db.incident.count();
  console.log("Total:", total);
  for (const g of groups) console.log(" ", g.status, ":", g._count.id);
  await db.$disconnect();
}
main().catch(console.error);
