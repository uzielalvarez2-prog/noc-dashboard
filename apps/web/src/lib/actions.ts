"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function loginAction(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Ingresa email y contraseña." };
  }

  // Validar credenciales directamente antes de llamar a NextAuth
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) return { error: "Credenciales incorrectas. Intenta de nuevo." };

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return { error: "Credenciales incorrectas. Intenta de nuevo." };
  } catch (dbErr) {
    console.error("[loginAction] DB error:", dbErr);
    return { error: "Error de conexión. Intenta de nuevo en unos segundos." };
  }

  // Credenciales válidas — iniciar sesión con NextAuth
  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false, // Manejamos el redirect manualmente
    });
  } catch (err) {
    // En NextAuth v5, signIn con redirect:false puede lanzar igual
    // Si no es un error de auth, podría ser un redirect interno — ignorar
    if (err instanceof AuthError) {
      return { error: `Error al iniciar sesión (${err.type}). Intenta de nuevo.` };
    }
    // Cualquier otro error (incluyendo NEXT_REDIRECT) — continuar al redirect manual
  }

  // Redirect manual — seguro en cualquier versión de Next.js
  redirect("/");
}
