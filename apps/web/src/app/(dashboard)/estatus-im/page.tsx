import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-session";
import { canConsultarEstatusIm } from "@/lib/permissions";
import { ImEstatusPanel } from "@/components/im-estatus/ImEstatusPanel";

export const dynamic = "force-dynamic";

export default async function EstatusImPage() {
  const session = await getServerSession();
  if (!session || !canConsultarEstatusIm(session.role)) {
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Estatus de IMs</h1>
        <p className="mt-1 text-sm text-text-muted">
          Pega una lista de incidentes: se consulta en HPSM su estatus y últimas actividades, listo
          para mandar por WhatsApp. Tarda ~20 s por IM y espera su turno detrás de las corridas del
          scraper.
        </p>
      </div>
      <ImEstatusPanel />
    </div>
  );
}
