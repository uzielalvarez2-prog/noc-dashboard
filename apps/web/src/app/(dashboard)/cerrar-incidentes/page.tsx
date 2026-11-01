import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-session";
import { canCerrarIncidentes } from "@/lib/permissions";
import { CerrarIncidentesPanel } from "@/components/cerrar-incidentes/CerrarIncidentesPanel";

export const dynamic = "force-dynamic";

export default async function CerrarIncidentesPage() {
  const session = await getServerSession();
  if (!session || !canCerrarIncidentes(session.role)) {
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Cerrar incidentes</h1>
        <p className="mt-1 text-sm text-text-muted">
          Pega una lista de incidentes y elige el template de cierre. El agente los abre en HPSM, aplica
          el template y los cierra. Empieza en modo <span className="font-semibold">Verificar</span>{" "}
          (no toca nada) para confirmar que todo está en orden; cambia a{" "}
          <span className="font-semibold">Cerrar de verdad</span> cuando estés seguro. Tarda ~30 s por IM
          y espera su turno detrás de las corridas del scraper.
        </p>
      </div>
      <CerrarIncidentesPanel />
    </div>
  );
}
