import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "NOC_ADMIN")
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = 20;
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
      include: { user: { select: { name: true, email: true } } },
    }),
    db.auditLog.count(),
  ]);

  return NextResponse.json({ logs, total, page, pages: Math.ceil(total / limit) });
}
