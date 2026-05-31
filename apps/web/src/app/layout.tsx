import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SessionProvider } from "@/components/layout/SessionProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NOC Dashboard",
  description: "Centro de operaciones de red — monitoreo en tiempo real",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Auth tolerante a fallos en producción
  let session = null;
  try {
    const { auth } = await import("@/lib/auth");
    session = await auth();
  } catch {
    // Si auth falla (ej. primer cold-start sin cookie), continuar sin sesión
  }

  return (
    <html
      lang="es"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full bg-background text-text-primary antialiased">
        <SessionProvider session={session}>{children}</SessionProvider>
      </body>
    </html>
  );
}
