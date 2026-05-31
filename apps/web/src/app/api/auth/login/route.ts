import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { encode } from "next-auth/jwt";

// En NextAuth v5: salt = nombre de la cookie (sin prefijo __Secure-)
// getToken decodifica con ese mismo salt por defecto
const COOKIE_NAME_BASE = "authjs.session-token";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Faltan credenciales" }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { email: email.trim() } });

    if (!user) {
      return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
    }

    const secret = process.env.AUTH_SECRET ?? "";
    const isProduction = process.env.NODE_ENV === "production";

    // Salt = nombre base de la cookie (NextAuth v5 usa esto internamente)
    const token = await encode({
      token: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        sub: user.id,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60,
      },
      secret,
      salt: COOKIE_NAME_BASE,
    });

    // En HTTPS producción la cookie lleva prefijo __Secure-
    const cookieName = isProduction
      ? `__Secure-${COOKIE_NAME_BASE}`
      : COOKIE_NAME_BASE;

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: cookieName,
      value: token,
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60,
    });

    return response;
  } catch (err) {
    console.error("[POST /api/auth/login]", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
