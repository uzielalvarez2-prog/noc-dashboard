import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash("noc-admin-2026", 12);

  const admin = await db.user.upsert({
    where: { email: "admin@noc.local" },
    update: {},
    create: {
      email: "admin@noc.local",
      passwordHash,
      name: "NOC Admin",
      role: "NOC_ADMIN",
    },
  });

  console.log("Admin creado:", admin.email);

  // Seed operadores de ejemplo
  const operators = [
    { id: "OP001", name: "Carlos Mendez", email: "cmendez@noc.local", team: "NOC", isOnShift: true },
    { id: "OP002", name: "Laura Torres", email: "ltorres@noc.local", team: "NOC", isOnShift: true },
    { id: "OP003", name: "Miguel Reyes", email: "mreyes@noc.local", team: "NOC", isOnShift: false },
  ];

  for (const op of operators) {
    await db.operator.upsert({
      where: { id: op.id },
      update: op,
      create: op,
    });
  }

  console.log("Operadores de ejemplo creados:", operators.length);

  // Seed incidentes de ejemplo para desarrollo
  const now = new Date();
  const incidents = [
    {
      id: "IM0000001",
      title: "Caída de enlace principal MPLS — Monterrey",
      severity: "CRITICAL" as const,
      status: "OPEN" as const,
      assignedTo: "OP001",
      slaDeadline: new Date(now.getTime() + 2 * 3600000), // 2h
      slaBreached: false,
      slaRiskAt: new Date(now.getTime() + 1 * 3600000),
      rawData: {},
      createdAt: new Date(now.getTime() - 30 * 60000),
      updatedAt: now,
    },
    {
      id: "IM0000002",
      title: "Latencia alta en router Cisco 7600 — CDMX",
      severity: "HIGH" as const,
      status: "IN_PROGRESS" as const,
      assignedTo: "OP002",
      slaDeadline: new Date(now.getTime() + 6 * 3600000),
      slaBreached: false,
      slaRiskAt: new Date(now.getTime() + 4 * 3600000),
      rawData: {},
      createdAt: new Date(now.getTime() - 2 * 3600000),
      updatedAt: now,
    },
    {
      id: "IM0000003",
      title: "Falla en switch de distribución — Guadalajara",
      severity: "MEDIUM" as const,
      status: "OPEN" as const,
      assignedTo: null,
      slaDeadline: new Date(now.getTime() + 24 * 3600000),
      slaBreached: false,
      slaRiskAt: null,
      rawData: {},
      createdAt: new Date(now.getTime() - 4 * 3600000),
      updatedAt: now,
    },
    {
      id: "IM0000004",
      title: "SLA vencido — BGP flap Huawei NE40",
      severity: "CRITICAL" as const,
      status: "OPEN" as const,
      assignedTo: "OP001",
      slaDeadline: new Date(now.getTime() - 1 * 3600000),
      slaBreached: true,
      slaRiskAt: new Date(now.getTime() - 2 * 3600000),
      rawData: {},
      createdAt: new Date(now.getTime() - 5 * 3600000),
      updatedAt: now,
    },
    {
      id: "IM0000005",
      title: "Restaurado — enlace secundario Puebla",
      severity: "LOW" as const,
      status: "RESOLVED" as const,
      assignedTo: "OP003",
      slaDeadline: new Date(now.getTime() + 48 * 3600000),
      slaBreached: false,
      slaRiskAt: null,
      rawData: {},
      createdAt: new Date(now.getTime() - 8 * 3600000),
      updatedAt: now,
    },
  ];

  for (const inc of incidents) {
    await db.incident.upsert({
      where: { id: inc.id },
      update: inc,
      create: inc,
    });
  }

  console.log("Incidentes de ejemplo creados:", incidents.length);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
