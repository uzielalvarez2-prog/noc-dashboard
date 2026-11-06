"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchCritical, type CriticalResponse } from "./CriticalIncidentsView";

// Botón 🔥 para marcar/desmarcar un incidente como "Crítico" (vista privada
// "&&& Criticos"). Encapsula el query ["critical"] y la mutation de toggle, para
// reusarse en cualquier tabla de abiertos (OpenIncidentTable, Total EDC, SISA).
// El que lo monta decide si mostrarlo (solo ADMIN).
export function CriticalToggleButton({ incidentId }: { incidentId: string }) {
  const qc = useQueryClient();

  const { data } = useQuery<CriticalResponse>({
    queryKey: ["critical"],
    queryFn: fetchCritical,
    refetchInterval: 60_000,
  });
  const isCritical = (data?.marked ?? []).includes(incidentId);

  const toggle = useMutation({
    mutationFn: async (value: boolean) => {
      await fetch("/api/incidents/critical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId, critical: value }),
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["critical"] }),
  });

  return (
    <button
      type="button"
      title={isCritical ? "Quitar de Críticos" : "Marcar como Crítico"}
      onClick={() => toggle.mutate(!isCritical)}
      className="mx-auto flex items-center justify-center"
    >
      <Flame
        className={cn(
          "h-4 w-4 cursor-pointer transition-colors",
          isCritical ? "fill-critical text-critical" : "text-text-muted hover:text-critical"
        )}
      />
    </button>
  );
}
