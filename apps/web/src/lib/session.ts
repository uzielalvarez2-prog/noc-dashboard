// Manejo de sesión simple y confiable — sin depender de NextAuth en el proxy
import { createHmac } from "crypto";

const SECRET = process.env.AUTH_SECRET ?? "noc-dashboard-fallback-secret";
const COOKIE_NAME = "noc_session";
const MAX_AGE = 8 * 60 * 60; // 8 horas en segundos

export interface SessionPayload {
  id: string;
  email: string;
  name: string;
  role: string;
  exp: number;
}

function sign(payload: SessionPayload): string {
  const data = JSON.stringify(payload);
  const b64 = Buffer.from(data).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verify(token: string): SessionPayload | null {
  try {
    const [b64, sig] = token.split(".");
    if (!b64 || !sig) return null;
    const expected = createHmac("sha256", SECRET).update(b64).digest("base64url");
    if (sig !== expected) return null;
    const payload: SessionPayload = JSON.parse(Buffer.from(b64, "base64url").toString());
    if (Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createSessionCookie(payload: Omit<SessionPayload, "exp">) {
  const full: SessionPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + MAX_AGE };
  const token = sign(full);
  const isProduction = process.env.NODE_ENV === "production";
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE,
  };
}

export function getSessionFromCookie(cookieValue: string | undefined): SessionPayload | null {
  if (!cookieValue) return null;
  return verify(cookieValue);
}

export { COOKIE_NAME };
