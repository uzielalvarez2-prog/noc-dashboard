"use client";

import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveIndicator } from "@/components/dashboard/LiveIndicator";
import { useEffect, useState } from "react";

const BREADCRUMBS: Record<string, string> = {
  "/": "Overview",
  "/incidents": "Incidentes",
  "/sla": "SLA",
  "/operators": "Operadores",
  "/settings": "Configuración",
};

export function Header({ lastSync }: { lastSync?: string }) {
  const pathname = usePathname();
  const segment = "/" + pathname.split("/")[1];
  const breadcrumb = BREADCRUMBS[segment] ?? "NOC";

  // Leer nombre/role de la cookie de sesión vía API
  const [userName, setUserName] = useState("");
  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => setUserName(d.name ?? "")).catch(() => {});
  }, []);

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-6">
      <div>
        <p className="text-xs text-text-muted">NOC Dashboard</p>
        <p className="text-sm font-semibold text-text-primary">{breadcrumb}</p>
      </div>

      <div className="flex items-center gap-4">
        <LiveIndicator lastSync={lastSync} />
        <div className="flex items-center gap-2">
          {userName && (
            <p className="text-xs font-medium text-text-primary">{userName}</p>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            title="Cerrar sesión"
            className="h-8 w-8 text-text-muted hover:text-critical"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
