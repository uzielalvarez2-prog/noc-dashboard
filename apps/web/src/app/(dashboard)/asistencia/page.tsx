import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-session";
import { canAccessAsistencia } from "@/lib/permissions";
import { AsistenciaView } from "@/components/asistencia/AsistenciaView";

export const dynamic = "force-dynamic";

export default async function AsistenciaPage() {
  const session = await getServerSession();
  if (!session || !canAccessAsistencia(session.role)) {
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Asistencia</h1>
        <p className="mt-1 text-sm text-text-muted">
          Control de asistencia del equipo. Se asume que cada quien cumplió su horario;
          solo registras lo que se sale de lo normal (faltas, retardos, permisos, cambios).
        </p>
      </div>

      <AsistenciaView />
    </div>
  );
}
