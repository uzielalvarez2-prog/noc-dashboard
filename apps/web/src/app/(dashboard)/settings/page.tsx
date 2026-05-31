import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-session";
import { AlertRulesPanel } from "@/components/settings/AlertRulesPanel";
import { WorkerStatusCard } from "@/components/settings/WorkerStatusCard";
import { CSVUpload } from "@/components/settings/CSVUpload";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getServerSession();
  if (!session || session.role !== "NOC_ADMIN") {
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Configuración</h1>
        <p className="mt-1 text-sm text-text-muted">
          Gestión de datos, alertas y estado del sistema
        </p>
      </div>

      <WorkerStatusCard />
      <CSVUpload />
      <AlertRulesPanel />
    </div>
  );
}
