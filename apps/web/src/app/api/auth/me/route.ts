import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie, COOKIE_NAME } from "@/lib/session";

export async function GET(req: NextRequest) {
  const cookieValue = req.cookies.get(COOKIE_NAME)?.value;
  const session = getSessionFromCookie(cookieValue);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json({ id: session.id, name: session.name, email: session.email, role: session.role });
}
