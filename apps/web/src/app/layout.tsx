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

// La sesión se detecta del lado del cliente via SessionProvider
// No llamamos auth() aquí para evitar errores en prerendering y cold-starts
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full bg-background text-text-primary antialiased">
        <SessionProvider session={null}>{children}</SessionProvider>
      </body>
    </html>
  );
}
