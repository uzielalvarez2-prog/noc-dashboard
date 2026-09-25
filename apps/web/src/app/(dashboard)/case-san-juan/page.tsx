import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-session";
import { canVerCaseSanJuan } from "@/lib/permissions";
import { CaseSanJuanView } from "@/components/case-san-juan/CaseSanJuanView";

export const dynamic = "force-dynamic";

export default async function CaseSanJuanPage() {
  const session = await getServerSession();
  if (!session || !canVerCaseSanJuan(session.role)) {
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Case San Juan</h1>
        <p className="mt-1 text-sm text-text-muted">
          Incidentes abiertos con folio SISA del CASE SAN JUAN. Clic en un renglón para ver su bitácora
          de Estatus CASE y copiar las notas.
        </p>
      </div>
      <CaseSanJuanView />
    </div>
  );
}
