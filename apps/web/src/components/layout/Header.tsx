"use client";

import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveIndicator } from "@/components/dashboard/LiveIndicator";
import type { Session } from "next-auth";

const BREADCRUMBS: Record<string, string> = {
  "/": "Overview",
  "/incidents": "Incidentes",
  "/sla": "SLA",
  "/operators": "Operadores",
  "/settings": "Configuración",
};

interface HeaderProps {
  session: Session | null;
  lastSync?: string;
}

export function Header({ session, lastSync }: HeaderProps) {
  const pathname = usePathname();
  const segment = "/" + pathname.split("/")[1];
  const breadcrumb = BREADCRUMBS[segment] ?? BREADCRUMBS[pathname] ?? "NOC";

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-6">
      <div>
        <p className="text-xs text-text-muted">NOC Dashboard</p>
        <p className="text-sm font-semibold text-text-primary">{breadcrumb}</p>
      </div>

      <div className="flex items-center gap-4">
        <LiveIndicator lastSync={lastSync} />

        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-xs font-medium text-text-primary">
              {session?.user?.name ?? "Operador"}
            </p>
            <p className="font-mono text-xs text-text-muted">
              {session?.user?.email ?? ""}
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut({ callbackUrl: "/login" })}
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
