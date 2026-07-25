import { WhatsappSendPanel } from "@/components/whatsapp/WhatsappSendPanel";

export const dynamic = "force-dynamic";

export default function WhatsappPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Enviar WhatsApp</h1>
        <p className="mt-1 text-sm text-text-muted">
          Manda un mensaje a los grupos operativos desde el número de la empresa.
          El envío sale por el mismo WhatsApp del NOC.
        </p>
      </div>

      <WhatsappSendPanel />
    </div>
  );
}
