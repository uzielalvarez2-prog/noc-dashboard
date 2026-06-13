import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie, COOKIE_NAME } from "@/lib/session";
import { canAccessSettings } from "@/lib/permissions";

const PUBLIC_PATHS = [
  "/login",
  "/design",
  "/api/auth",
  "/api/health",
  "/_next",
  "/favicon.ico",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  // Llamadas internas del scraper: clave en header bypass la sesión de usuario
  const internalKey = process.env.INTERNAL_API_KEY;
  if (internalKey && request.headers.get("x-internal-key") === internalKey) {
    return NextResponse.next();
  }

  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  const session = getSessionFromCookie(cookieValue);

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Configuración (página, usuarios y alertas) — solo ADMIN y SUPERVISOR
  const isSettingsArea =
    pathname.startsWith("/settings") ||
    pathname.startsWith("/api/users") ||
    pathname.startsWith("/api/alerts") ||
    pathname.startsWith("/api/audit-logs");
  if (isSettingsArea && !canAccessSettings(session.role)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth|design).*)"],
};
