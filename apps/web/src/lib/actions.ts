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
    await signIn("credentials", { email, password, redirectTo: "/" });
    return null;
  } catch (err) {
    // signIn lanza NEXT_REDIRECT cuando tiene éxito — re-lanzarlo siempre
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    if (err instanceof AuthError) {
      switch (err.type) {
        case "CredentialsSignin":
          return { error: "Credenciales incorrectas. Intenta de nuevo." };
        default:
          return { error: `Error de autenticación (${err.type}). Intenta de nuevo.` };
      }
    }
    return { error: "Error inesperado. Intenta de nuevo." };
  }
}
