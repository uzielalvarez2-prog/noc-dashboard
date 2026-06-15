import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { z } from "zod";
import { canAccessSettings } from "@/lib/permissions";

const CreateAlertRuleSchema = z.object({
  name: z.string().min(1),
  trigger: z.enum(["SLA_RISK", "SLA_BREACHED", "CRITICAL_OPEN", "CRITICAL_UNASSIGNED"]),
  channels: z.array(z.string()).min(1),
  recipients: z.array(z.string().email()).min(1),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessSettings(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const rules = await db.alertRule.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(rules);
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessSettings(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateAlertRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rule = await db.alertRule.create({
    data: { ...parsed.data, createdBy: session.id },
  });

  await db.auditLog.create({
    data: {
      userId: session.id,
      action: "CREATE_ALERT_RULE",
      targetId: rule.id,
      metadata: { ruleName: rule.name },
    },
  }).catch(() => {});

  return NextResponse.json(rule, { status: 201 });
}
