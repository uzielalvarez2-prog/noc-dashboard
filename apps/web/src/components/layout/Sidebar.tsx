"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { canAccessSettings, canAccessMonitoring } from "@/lib/permissions";
import {
  LayoutDashboard,
  AlertTriangle,
  BarChart2,
  Users,
  Settings,
  Upload,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Star,
  BookOpen,
  MessageCircle,
  Radar,
} from "lucide-react";
import { useTheme } from "@/components/layout/ThemeProvider";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/incidents", label: "Incidentes", icon: AlertTriangle },
  { href: "/sla", label: "SLA", icon: BarChart2 },
  { href: "/operators", label: "Operadores", icon: Users },
  { href: "/clientes-top", label: "Clientes TOP", icon: Star },
  { href: "/base-conocimiento", label: "Base de Conocimiento", icon: BookOpen },
  { href: "/whatsapp", label: "Enviar WhatsApp", icon: MessageCircle },
  { href: "/import", label: "Importar CSV", icon: Upload },
  { href: "/monitoreo-ip", label: "Monitoreo IP", icon: Radar, monitoringOnly: true },
  { href: "/settings", label: "Configuración", icon: Settings, settingsOnly: true },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const [role, setRole] = useState<string | undefined>();
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setRole(d.role))
      .catch(() => {});
  }, []);

  const items = NAV_ITEMS.filter(
    (item) =>
      (!item.settingsOnly || canAccessSettings(role)) &&
      (!("monitoringOnly" in item) || !item.monitoringOnly || canAccessMonitoring(role))
  );

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-border bg-surface transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-border px-4">
        {!collapsed && (
          <span className="font-bold text-text-primary">
            NOC <span className="text-accent">Dashboard</span>
          </span>
        )}
        {collapsed && (
          <span className="font-bold text-accent">N</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {items.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:bg-surface-elevated hover:text-text-primary"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={theme === "dark" ? "Cambiar a modo día" : "Cambiar a modo noche"}
        className={cn(
          "flex h-10 items-center border-t border-border text-text-muted transition-colors hover:text-text-primary",
          collapsed ? "justify-center" : "gap-3 px-3"
        )}
      >
        {theme === "dark" ? (
          <Sun className="h-4 w-4 shrink-0" />
        ) : (
          <Moon className="h-4 w-4 shrink-0" />
        )}
        {!collapsed && (
          <span className="text-sm font-medium">
            {theme === "dark" ? "Modo día" : "Modo noche"}
          </span>
        )}
      </button>

      {/* Sidebar collapse button */}
      <button
        onClick={onToggle}
        className="flex h-10 items-center justify-center border-t border-border text-text-muted transition-colors hover:text-text-primary"
        aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>
    </aside>
  );
}
