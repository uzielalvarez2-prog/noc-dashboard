import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  // Borrar todos los incidentes OPEN/IN_PROGRESS/RESOLVED (son el snapshot "abiertos")
  // Se mantienen solo los CLOSED (cerrados confirmados por run-closed.ts)
  const deleted = await db.incident.deleteMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS", "RESOLVED"] } },
  });
  console.log(`Incidentes stale eliminados: ${deleted.count}`);

  const [byStatus, total] = await Promise.all([
    db.incident.groupBy({ by: ["status"], _count: { id: true } }),
    db.incident.count(),
  ]);

  console.log(`\n=== Estado BD post-limpieza ===`);
  console.log(`Total incidents: ${total}`);
  for (const s of byStatus) {
    console.log(`  ${s.status}: ${s._count.id}`);
  }
}

main().catch(console.error).finally(() => db.$disconnect());
