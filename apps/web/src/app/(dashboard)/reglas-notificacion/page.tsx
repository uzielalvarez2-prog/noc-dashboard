import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-session";
import { canAccessMonitoring } from "@/lib/permissions";
import { AperturaReglasPanel } from "@/components/monitoring/AperturaReglasPanel";
import { GruposSuspendidosPanel } from "@/components/monitoring/GruposSuspendidosPanel";

export const dynamic = "force-dynamic";

export default async function ReglasNotificacionPage() {
  const session = await getServerSession();
  if (!session || !canAccessMonitoring(session.role)) {
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Alertas de apertura</h1>
        <p className="mt-1 text-sm text-text-muted">
          Define qué incidentes nuevos se avisan por WhatsApp y a qué grupos. Un
          incidente cumple la regla si cumple todos los criterios que llenes
          (Servicio, inicio del IM, Empresa).
        </p>
      </div>

      <AperturaReglasPanel />

      <GruposSuspendidosPanel />
    </div>
  );
}
