"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import type { Severity, IncidentStatus } from "@/types";

export interface IncidentFilters {
  page: number;
  limit: number;
  severity: Severity | "";
  status: IncidentStatus | "";
  assignedTo: string;
  slaRisk: boolean;
}

export function useIncidentFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const filters: IncidentFilters = {
    page: Math.max(1, Number(params.get("page") ?? "1")),
    limit: Number(params.get("limit") ?? "50"),
    severity: (params.get("severity") as Severity) || "",
    status: (params.get("status") as IncidentStatus) || "",
    assignedTo: params.get("assignedTo") ?? "",
    slaRisk: params.get("slaRisk") === "true",
  };

  const setFilters = useCallback(
    (updates: Partial<IncidentFilters>) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(updates).forEach(([k, v]) => {
        if (v === "" || v === false || v === undefined || v === null) {
          next.delete(k);
        } else {
          next.set(k, String(v));
        }
      });
      // Resetear a página 1 cuando cambia cualquier filtro (salvo page)
      if (!("page" in updates)) next.set("page", "1");
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router]
  );

  const buildQueryString = () => {
    const q = new URLSearchParams();
    if (filters.page > 1) q.set("page", String(filters.page));
    q.set("limit", String(filters.limit));
    if (filters.severity) q.set("severity", filters.severity);
    if (filters.status) q.set("status", filters.status);
    if (filters.assignedTo) q.set("assignedTo", filters.assignedTo);
    if (filters.slaRisk) q.set("slaRisk", "true");
    return q.toString();
  };

  return { filters, setFilters, buildQueryString };
}
