import { CSVUpload } from "@/components/settings/CSVUpload";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Importar CSV</h1>
        <p className="mt-1 text-sm text-text-muted">
          Actualiza el dashboard manualmente con un export de HPSM (abiertos o cerrados)
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5">
        <CSVUpload />
      </div>
    </div>
  );
}
