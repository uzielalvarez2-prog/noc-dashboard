import { ClientesTopPanel } from "@/components/clientes/ClientesTopPanel";

export const dynamic = "force-dynamic";

export default function ClientesTopPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Clientes TOP</h1>
        <p className="mt-1 text-sm text-text-muted">
          Base de clientes críticos. Cuando un incidente abierto coincide con una
          empresa o servicio de esta lista, entra a War Room y lanza una alerta.
        </p>
      </div>

      <ClientesTopPanel />
    </div>
  );
}
