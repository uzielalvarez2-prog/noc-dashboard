import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-session";
import { canAccessMonitoring } from "@/lib/permissions";
import { WatchedServicesPanel } from "@/components/monitoring/WatchedServicesPanel";

export const dynamic = "force-dynamic";

export default async function ServiciosVigiladosPage() {
  const session = await getServerSession();
  if (!session || !canAccessMonitoring(session.role)) {
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Servicios en posible baja</h1>
        <p className="mt-1 text-sm text-text-muted">
          Marca un número de Servicio que identificaste como probablemente dado
          de baja. Si vuelve a aparecer en un incidente nuevo, se avisa por
          WhatsApp a los grupos que elijas.
        </p>
      </div>

      <WatchedServicesPanel />
    </div>
  );
}
