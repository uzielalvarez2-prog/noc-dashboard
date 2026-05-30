import { Suspense } from "react";
import { IncidentTable } from "@/components/incidents/IncidentTable";

export default function IncidentsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Incidentes</h1>
        <p className="mt-1 text-sm text-text-muted">
          Todos los incidentes activos — filtra, ordena y exporta
        </p>
      </div>

      <Suspense
        fallback={
          <div className="py-12 text-center text-sm text-text-muted">
            Cargando tabla...
          </div>
        }
      >
        <IncidentTable />
      </Suspense>
    </div>
  );
}
