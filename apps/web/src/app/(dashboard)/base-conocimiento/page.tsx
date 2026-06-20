import { KnowledgeBasePanel } from "@/components/knowledge/KnowledgeBasePanel";

export const dynamic = "force-dynamic";

export default function BaseConocimientoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Base de Conocimiento</h1>
        <p className="mt-1 text-sm text-text-muted">
          Manuales, políticas, procedimientos y documentos de consulta. Enlaces a
          Google Drive, PDF y recursos. El administrador gestiona el contenido.
        </p>
      </div>

      <KnowledgeBasePanel />
    </div>
  );
}
