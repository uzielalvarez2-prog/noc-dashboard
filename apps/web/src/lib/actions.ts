"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";

export async function loginAction(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Ingresa email y contraseña." };
  }

  try {
    // NextAuth v5: signIn desde Server Action lanza NEXT_REDIRECT al tener éxito
    // y AuthError si las credenciales son incorrectas
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/",
    });
  } catch (err) {
    // AuthError = credenciales incorrectas o error de auth
    if (err instanceof AuthError) {
      return { error: "Credenciales incorrectas. Intenta de nuevo." };
    }
    // Cualquier otro error (NEXT_REDIRECT incluido) se re-lanza
    // Next.js lo intercepta y ejecuta el redirect con la cookie de sesión
    throw err;
  }

  return null;
}
