// Helper para leer sesión en API routes y Server Components
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionFromCookie, COOKIE_NAME, type SessionPayload } from "@/lib/session";

/** Para API routes (Route Handlers) */
export function getSessionFromRequest(req: NextRequest): SessionPayload | null {
  const value = req.cookies.get(COOKIE_NAME)?.value;
  return getSessionFromCookie(value);
}

/** Para Server Components */
export async function getServerSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  return getSessionFromCookie(value);
}
