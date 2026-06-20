import { WarRoomView } from "@/components/warroom/WarRoomView";

export const dynamic = "force-dynamic";

export default function WarRoomPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-text-primary">
          <span className="text-critical">War Room</span>
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Incidentes de Clientes TOP (severidad crítica). Coinciden por empresa o
          servicio con la base. Historial de 7 días para medir recurrencia.
        </p>
      </div>

      <WarRoomView />
    </div>
  );
}
