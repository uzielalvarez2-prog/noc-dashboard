import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-session";
import { canAccessMonitoring } from "@/lib/permissions";
import { MonitoredIpsPanel } from "@/components/monitoring/MonitoredIpsPanel";

export const dynamic = "force-dynamic";

export default async function MonitoreoIpPage() {
  const session = await getServerSession();
  if (!session || !canAccessMonitoring(session.role)) {
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Monitoreo de IP</h1>
        <p className="mt-1 text-sm text-text-muted">
          Base de IPs por cliente. Actívalas desde Incidentes Abiertos para avisar
          por WhatsApp cuando el enlace se recupere.
        </p>
      </div>

      <MonitoredIpsPanel />
    </div>
  );
}
