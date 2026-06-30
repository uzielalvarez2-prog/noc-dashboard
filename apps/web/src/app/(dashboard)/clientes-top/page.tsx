import { ClientesTopTabs } from "@/components/clientes/ClientesTopTabs";

export const dynamic = "force-dynamic";

export default function ClientesTopPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Clientes TOP</h1>
      </div>

      <ClientesTopTabs />
    </div>
  );
}
