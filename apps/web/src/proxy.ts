import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = ["/login", "/design", "/api/auth", "/api/health", "/_next", "/favicon.ico"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  // NextAuth v5 usa "authjs.session-token" en producción (HTTPS)
  // NextAuth v4 usaba "next-auth.session-token"
  // Probamos ambos para compatibilidad
  const secret = process.env.AUTH_SECRET;

  const token =
    (await getToken({ req: request, secret, cookieName: "authjs.session-token" })) ??
    (await getToken({ req: request, secret, cookieName: "__Secure-authjs.session-token" })) ??
    (await getToken({ req: request, secret, cookieName: "next-auth.session-token" })) ??
    (await getToken({ req: request, secret }));

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
