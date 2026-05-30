import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { getIncidentById } from "@/lib/queries/incidents";
import { db } from "@/lib/db";
import { IncidentDetail } from "@/components/incidents/IncidentDetail";
import type { Incident } from "@/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function IncidentDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();

  const raw = await getIncidentById(id);
  if (!raw) notFound();

  const incident = raw as unknown as Incident;

  // Audit log
  if (session?.user?.id) {
    await db.auditLog
      .create({
        data: {
          userId: session.user.id,
          action: "VIEW_INCIDENT",
          targetId: id,
          metadata: { incidentId: id, severity: incident.severity },
        },
      })
      .catch(() => {});
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/incidents"
          className="flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-accent"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Volver a Incidentes
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <IncidentDetail incident={incident} />
      </div>
    </div>
  );
}
