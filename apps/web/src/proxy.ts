import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie, COOKIE_NAME } from "@/lib/session";

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

  // Permitir el scraper headless con API key interna
  const apiKey = request.headers.get("x-internal-key");
  const validKey = process.env.INTERNAL_API_KEY;
  if (validKey && apiKey === validKey) return NextResponse.next();

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

  if (pathname.startsWith("/settings") && session.role !== "NOC_ADMIN") {
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
