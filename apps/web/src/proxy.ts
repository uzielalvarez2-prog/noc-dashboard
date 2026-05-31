import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = ["/login", "/design", "/api/auth", "/api/health", "/_next", "/favicon.ico"];

// Mismo salt que usa encode() en la ruta de login
const COOKIE_NAME_BASE = "authjs.session-token";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  const secret = process.env.AUTH_SECRET ?? "";

  // Probar cookie de producción (__Secure-) y desarrollo sin prefijo
  // Ambas se decodifican con salt = COOKIE_NAME_BASE
  const token =
    (await getToken({
      req: request,
      secret,
      cookieName: `__Secure-${COOKIE_NAME_BASE}`,
      salt: COOKIE_NAME_BASE,
    }).catch(() => null)) ??
    (await getToken({
      req: request,
      secret,
      cookieName: COOKIE_NAME_BASE,
      salt: COOKIE_NAME_BASE,
    }).catch(() => null));

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/settings") && token.role !== "NOC_ADMIN") {
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
