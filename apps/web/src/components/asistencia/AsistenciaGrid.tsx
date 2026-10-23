"use client";

import {
  DIAS_SEMANA,
  TIPO_ABBR,
  TIPO_CLASE,
  TIPO_LABEL,
  horarioEsperado,
  weekdayOfKey,
  type Colaborador,
  type Evento,
} from "./types";

interface Props {
  colaboradores: Colaborador[];
  dias: string[]; // claves YYYY-MM-DD del mes
  eventosPorCol: Map<string, Evento[]>;
  cobertura: Record<string, number>;
  hoy: string;
  onCelda: (col: Colaborador, fecha: string) => void;
}

/**
 * Cuadrícula personas × días. Cada celda muestra:
 *  - evento (color + letra) si hay,
 *  - "·" tenue si trabaja sin novedad,
 *  - vacío si descansa.
 * Click en cualquier celda abre el diálogo para registrar/editar.
 */
export function AsistenciaGrid({
  colaboradores,
  dias,
  eventosPorCol,
  cobertura,
  hoy,
  onCelda,
}: Props) {
  const diaNum = (key: string) => Number(key.slice(8, 10));

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="border-collapse text-xs">
        <thead>
          <tr className="bg-surface-elevated">
            <th className="sticky left-0 z-10 min-w-[180px] bg-surface-elevated px-3 py-2 text-left font-medium text-text-muted">
              Colaborador
            </th>
            {dias.map((key) => {
              const wd = weekdayOfKey(key);
              const finde = wd === 0 || wd === 6;
              const esHoy = key === hoy;
              return (
                <th
                  key={key}
                  className={`w-7 px-0 py-1 text-center font-medium ${
                    esHoy ? "bg-accent/15 text-accent" : finde ? "text-text-disabled" : "text-text-muted"
                  }`}
                >
                  <div>{DIAS_SEMANA[wd]}</div>
                  <div className="text-[10px]">{diaNum(key)}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {colaboradores.map((col) => {
            const evCol = eventosPorCol.get(col.id) ?? [];
            const evPorFecha = new Map(evCol.filter((e) => e.fecha).map((e) => [e.fecha, e]));
            return (
              <tr key={col.id} className="border-t border-border">
                <td
                  className="sticky left-0 z-10 min-w-[180px] max-w-[180px] truncate bg-surface px-3 py-1 text-text-primary"
                  title={`${col.nombre} · ${col.grupo}`}
                >
                  {col.nombre}
                </td>
                {dias.map((key) => {
                  const ev = evPorFecha.get(key);
                  const esp = horarioEsperado(col, key, evCol);
                  const esHoy = key === hoy;
                  let content = "";
                  let clase = "";
                  let title = `${col.nombre} · ${key}`;
                  if (ev) {
                    content = TIPO_ABBR[ev.tipo];
                    clase = TIPO_CLASE[ev.tipo];
                    title = `${col.nombre} · ${key} · ${TIPO_LABEL[ev.tipo]}${
                      ev.nota ? ` — ${ev.nota}` : ""
                    }`;
                  } else if (esp.trabaja) {
                    content = "·";
                    clase = "text-text-disabled";
                    title += ` · ${esp.horario}`;
                  } else {
                    title += " · descanso";
                  }
                  return (
                    <td key={key} className="p-0.5 text-center">
                      <button
                        onClick={() => onCelda(col, key)}
                        className={`flex h-6 w-6 items-center justify-center rounded text-[11px] font-semibold transition-colors hover:ring-1 hover:ring-accent ${clase} ${
                          esHoy && !ev ? "bg-accent/5" : ""
                        }`}
                        title={title}
                      >
                        {content}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {/* Fila de cobertura: cuánta gente debe estar en turno cada día */}
          <tr className="border-t-2 border-border bg-surface-elevated">
            <td className="sticky left-0 z-10 bg-surface-elevated px-3 py-1.5 font-medium text-text-muted">
              En turno
            </td>
            {dias.map((key) => (
              <td key={key} className="px-0 py-1.5 text-center font-semibold text-text-primary">
                {cobertura[key] ?? 0}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
