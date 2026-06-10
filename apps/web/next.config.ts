import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: require("path").resolve(__dirname, "../.."),
  },
  // Garantizar que NextAuth siempre tenga una URL válida durante el build
  env: {
    NEXTAUTH_URL:
      process.env.NEXTAUTH_URL ||
      process.env.AUTH_URL ||
      "https://noc-dashboard-iota.vercel.app",
    AUTH_URL:
      process.env.AUTH_URL ||
      process.env.NEXTAUTH_URL ||
      "https://noc-dashboard-iota.vercel.app",
    INTERNAL_API_KEY: process.env.INTERNAL_API_KEY ?? "",
  },
};

export default nextConfig;
