"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadXLSX } from "@/lib/excelExport";
import { TIPOS_EVENTO, TIPO_LABEL, MESES, type Resumen } from "./types";

interface Props {
  resumen: Resumen[];
  grupoFiltro: string;
  year: number;
  month: number;
}

/** Tabla de resumen por colaborador del mes + descarga a Excel. */
export function ResumenPanel({ resumen, grupoFiltro, year, month }: Props) {
  const filas = resumen.filter((r) => grupoFiltro === "Todos" || r.grupo === grupoFiltro);

  function exportar() {
    const headers = [
      "Colaborador",
      "Grupo",
      "Días esperados",
      ...TIPOS_EVENTO.map((t) => TIPO_LABEL[t]),
    ];
    const rows = filas.map((r) => [
      r.nombre,
      r.grupo,
      r.diasEsperados,
      ...TIPOS_EVENTO.map((t) => r.conteos[t] ?? 0),
    ]);
    downloadXLSX(
      `Asistencia_${MESES[month - 1]}_${year}`,
      `${MESES[month - 1]} ${year}`,
      headers,
      rows,
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-text-primary">
          Resumen del mes {grupoFiltro !== "Todos" && `· ${grupoFiltro}`}
        </h2>
        <Button variant="outline" size="sm" onClick={exportar} className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> Excel
        </Button>
      </div>
      <div className="max-h-[50vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-elevated">
            <tr className="text-left text-xs text-text-muted">
              <th className="px-3 py-2 font-medium">Colaborador</th>
              {TIPOS_EVENTO.map((t) => (
                <th key={t} className="px-2 py-2 text-center font-medium" title={TIPO_LABEL[t]}>
                  {TIPO_LABEL[t]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((r) => {
              const total = TIPOS_EVENTO.reduce((s, t) => s + (r.conteos[t] ?? 0), 0);
              return (
                <tr
                  key={r.colaboradorId}
                  className="border-t border-border hover:bg-surface-elevated"
                >
                  <td className="px-3 py-1.5 text-text-primary">
                    {r.nombre}
                    {total === 0 && (
                      <span className="ml-2 text-xs text-text-muted">sin novedades</span>
                    )}
                  </td>
                  {TIPOS_EVENTO.map((t) => {
                    const n = r.conteos[t] ?? 0;
                    return (
                      <td
                        key={t}
                        className={`px-2 py-1.5 text-center ${
                          n > 0 ? "font-semibold text-text-primary" : "text-text-disabled"
                        }`}
                      >
                        {n || "·"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {filas.length === 0 && (
              <tr>
                <td
                  colSpan={TIPOS_EVENTO.length + 1}
                  className="px-3 py-6 text-center text-sm text-text-muted"
                >
                  No hay colaboradores en este grupo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
