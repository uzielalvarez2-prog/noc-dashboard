"use client";

import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveIndicator } from "@/components/dashboard/LiveIndicator";

const BREADCRUMBS: Record<string, string> = {
  "/": "Overview",
  "/incidents": "Incidentes",
  "/sla": "SLA",
  "/operators": "Operadores",
  "/settings": "Configuración",
};

interface HeaderProps {
  session: { user?: { name?: string | null; email?: string | null } } | null;
  lastSync?: string;
}

export function Header({ session, lastSync }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const segment = "/" + pathname.split("/")[1];
  const breadcrumb = BREADCRUMBS[segment] ?? BREADCRUMBS[pathname] ?? "NOC";

  async function handleSignOut() {
    // Redirect a NextAuth signout endpoint sin importar next-auth/react
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
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
