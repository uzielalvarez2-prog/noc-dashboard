import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AlertRulesPanel } from "@/components/settings/AlertRulesPanel";
import { WorkerStatusCard } from "@/components/settings/WorkerStatusCard";

export default async function SettingsPage() {
  const session = await auth();
  if (!session || session.user.role !== "NOC_ADMIN") {
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Configuración</h1>
        <p className="mt-1 text-sm text-text-muted">
          Gestión de alertas y estado del sistema
        </p>
      </div>

      <WorkerStatusCard />
      <AlertRulesPanel />
    </div>
  );
}
