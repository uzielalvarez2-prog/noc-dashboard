"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { PollingProvider } from "@/components/layout/PollingProvider";

// SessionProvider con ssr: false para evitar errores de URL en prerender de Vercel
const SessionProvider = dynamic(
  () => import("next-auth/react").then((m) => m.SessionProvider),
  { ssr: false }
);

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <SessionProvider>
      <PollingProvider>
        <div className="flex h-screen overflow-hidden bg-background">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((c) => !c)}
          />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header session={null} />
            <main className="flex-1 overflow-auto p-6">{children}</main>
          </div>
        </div>
      </PollingProvider>
    </SessionProvider>
  );
}
