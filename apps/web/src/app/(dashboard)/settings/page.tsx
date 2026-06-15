import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-session";
import { canAccessSettings } from "@/lib/permissions";
import { AlertRulesPanel } from "@/components/settings/AlertRulesPanel";
import { WorkerStatusCard } from "@/components/settings/WorkerStatusCard";
import { UsersPanel } from "@/components/settings/UsersPanel";
import { AuditLogPanel } from "@/components/settings/AuditLogPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getServerSession();
  if (!session || !canAccessSettings(session.role)) {
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Configuración</h1>
        <p className="mt-1 text-sm text-text-muted">
          Gestión de usuarios, alertas y estado del sistema
        </p>
      </div>

      <WorkerStatusCard />
      <AlertRulesPanel />

      <div className="border-t border-border pt-8 space-y-8">
        <UsersPanel />
        <AuditLogPanel />
      </div>
    </div>
  );
}
