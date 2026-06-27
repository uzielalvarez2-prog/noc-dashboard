// Export de incidentes abiertos a Excel — UNA fila por incidente (deduplicado).
// Reúne todo lo que coincide con el filtro (no solo la página visible) pidiendo
// al API la vista colapsada (collapse=true → 1 fila por IM, con "# Sitios" y
// "Varios (N)" en estado/distrito cuando el incidente toca más de uno), luego
// ordena por fecha de apertura en la dirección pedida.

import type { OpenIncidentRow, OpenListResponse } from "@/types/open";
import { downloadXLSX } from "@/lib/excelExport";
import { formatHpsmExcel } from "@/lib/utils";

export type SortDir = "asc" | "desc";

const COLUMNS = [
  "Incident ID",
  "Empresa",
  "Servicio",
  "Estado",
  "Distrito",
  "Asignado",
  "Estatus",
  "Grupo",
  "# Sitios",
  "Apertura",
];

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      // quita marcas diacríticas combinantes (acentos)
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "todos"
  );
}

/** Pagina contra el API hasta juntar todos los incidentes del filtro. */
async function fetchAllCollapsed(base: URLSearchParams): Promise<OpenIncidentRow[]> {
  const all: OpenIncidentRow[] = [];
  const pageSize = 200; // tope de la vista colapsada en el API
  let page = 1;
  for (;;) {
    const sp = new URLSearchParams(base);
    sp.set("page", String(page));
    sp.set("limit", String(pageSize));
    const res = await fetch(`/api/incidents/open?${sp.toString()}`);
    if (!res.ok) throw new Error("Error al obtener incidentes");
    const json = (await res.json()) as OpenListResponse;
    all.push(...json.data);
    if (json.data.length === 0 || all.length >= json.meta.total) break;
    page++;
  }
  return all;
}

export interface ExportOpenArgs {
  /** ALL | PEXA | CECOR */
  group?: string;
  /** Estatus exacto a filtrar (para las tarjetas por estatus). */
  status?: string;
  /** Texto libre del buscador (para el export de la tabla principal). */
  q?: string;
  /** Orden por fecha de apertura. asc = más antiguo→reciente. */
  sortDir?: SortDir;
  /** Etiqueta para el nombre del archivo (ej. "abiertos", el estatus, etc.). */
  label?: string;
}

export async function exportOpenIncidents(args: ExportOpenArgs): Promise<void> {
  const { group, status, q, sortDir = "desc", label } = args;

  const base = new URLSearchParams();
  if (group && group !== "ALL") base.set("group", group);
  if (status) base.set("status", status);
  if (q) base.set("q", q);
  // collapse omitido → API colapsa a 1 fila por incidente (deduplicado).

  const rows = await fetchAllCollapsed(base);

  // Orden por fecha de apertura según la dirección elegida.
  rows.sort((a, b) => {
    const da = new Date(a.openTime).getTime();
    const db = new Date(b.openTime).getTime();
    return sortDir === "asc" ? da - db : db - da;
  });

  const exportRows: (string | number)[][] = rows.map((r) => [
    r.incidentId,
    r.company,
    r.serviceId,
    r.state,
    r.district,
    r.assignee ?? "",
    r.status,
    r.group,
    r.siteCount,
    formatHpsmExcel(r.openTime),
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  const parts = ["incidentes", label ? slug(label) : "abiertos"];
  if (group && group !== "ALL") parts.push(group.toLowerCase());
  parts.push(stamp);

  await downloadXLSX(parts.join("-"), "Abiertos", COLUMNS, exportRows);
}
