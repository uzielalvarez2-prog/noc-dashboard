"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ResumenPanel } from "./ResumenPanel";
import { EventoDialog } from "./EventoDialog";
import { AsistenciaGrid } from "./AsistenciaGrid";
import {
  MESES,
  hoyKey,
  daysInMonth,
  horarioEsperado,
  type AsistenciaData,
  type Colaborador,
  type Evento,
} from "./types";

const GRUPOS = ["Todos", "Matutino", "Vespertino", "CECOR"];

async function fetchData(year: number, month: number): Promise<AsistenciaData> {
  const res = await fetch(`/api/asistencia?year=${year}&month=${month}`);
  if (!res.ok) throw new Error("Error al cargar asistencia");
  return res.json();
}

export function AsistenciaView() {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(Number(hoyKey().slice(0, 4)));
  const [month, setMonth] = useState(Number(hoyKey().slice(5, 7)) || now.getUTCMonth() + 1);
  const [grupo, setGrupo] = useState("Todos");
  const [sel, setSel] = useState<{ col: Colaborador; fecha: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["asistencia", year, month],
    queryFn: () => fetchData(year, month),
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["asistencia", year, month] });
    setSel(null);
  }

  function cambiarMes(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y--;
    } else if (m > 12) {
      m = 1;
      y++;
    }
    setMonth(m);
    setYear(y);
  }

  const colaboradores = useMemo(
    () => (data?.colaboradores ?? []).filter((c) => grupo === "Todos" || c.grupo === grupo),
    [data, grupo],
  );

  // Eventos indexados por colaborador para pasarlos al grid y al panel Hoy.
  const eventosPorCol = useMemo(() => {
    const map = new Map<string, Evento[]>();
    for (const ev of data?.eventos ?? []) {
      const list = map.get(ev.colaboradorId) ?? [];
      list.push(ev);
      map.set(ev.colaboradorId, list);
    }
    return map;
  }, [data]);

  const hoy = hoyKey();
  const esMesActual = hoy.startsWith(`${year}-${String(month).padStart(2, "0")}`);

  // Panel "Hoy" — solo cuando el mes visible es el actual.
  const resumenHoy = useMemo(() => {
    if (!esMesActual || !data) return null;
    let deben = 0;
    const faltas: string[] = [];
    const retardos: string[] = [];
    const avisos: string[] = [];
    for (const col of colaboradores) {
      const evCol = eventosPorCol.get(col.id) ?? [];
      const esp = horarioEsperado(col, hoy, evCol);
      if (esp.trabaja) deben++;
      for (const ev of evCol) {
        if (ev.fecha !== hoy) continue;
        if (ev.tipo === "FALTA") faltas.push(col.nombre);
        else if (ev.tipo === "RETARDO") retardos.push(col.nombre);
        else if (ev.tipo === "AVISO") avisos.push(col.nombre);
      }
    }
    return { deben, faltas, retardos, avisos };
  }, [esMesActual, data, colaboradores, eventosPorCol, hoy]);

  if (isLoading) {
    return <p className="text-sm text-text-muted">Cargando…</p>;
  }

  if (!data || data.colaboradores.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">
        No hay colaboradores cargados todavía. Importa el Excel de horarios con{" "}
        <span className="font-mono text-xs">node scripts/importar-horarios.js</span> desde{" "}
        <span className="font-mono text-xs">apps/web</span>.
      </div>
    );
  }

  const horarioSel = sel
    ? horarioEsperado(sel.col, sel.fecha, eventosPorCol.get(sel.col.id) ?? []).horario
    : "";
  const eventoSel = sel
    ? (eventosPorCol.get(sel.col.id) ?? []).find((e) => e.fecha === sel.fecha) ?? null
    : null;

  return (
    <div className="space-y-6">
      {/* Controles: mes + grupo */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => cambiarMes(-1)}
            className="rounded-md border border-border p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[160px] text-center text-base font-semibold text-text-primary">
            {MESES[month - 1]} {year}
          </span>
          <button
            onClick={() => cambiarMes(1)}
            className="rounded-md border border-border p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {GRUPOS.map((g) => (
            <button
              key={g}
              onClick={() => setGrupo(g)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                grupo === g
                  ? "bg-accent/10 text-accent"
                  : "text-text-muted hover:bg-surface-elevated hover:text-text-primary"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Panel Hoy */}
      {resumenHoy && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HoyCard label="Deben estar hoy" value={resumenHoy.deben} tone="accent" />
          <HoyCard
            label="Faltas"
            value={resumenHoy.faltas.length}
            tone="critical"
            names={resumenHoy.faltas}
          />
          <HoyCard
            label="Retardos"
            value={resumenHoy.retardos.length}
            tone="warning"
            names={resumenHoy.retardos}
          />
          <HoyCard
            label="Avisaron"
            value={resumenHoy.avisos.length}
            tone="info"
            names={resumenHoy.avisos}
          />
        </div>
      )}

      {/* Cuadrícula del mes */}
      <AsistenciaGrid
        colaboradores={colaboradores}
        dias={daysInMonth(year, month)}
        eventosPorCol={eventosPorCol}
        cobertura={data.cobertura}
        hoy={hoy}
        onCelda={(col, fecha) => setSel({ col, fecha })}
      />

      {/* Resumen por colaborador */}
      <ResumenPanel resumen={data.resumen} grupoFiltro={grupo} year={year} month={month} />

      {sel && (
        <EventoDialog
          colaborador={sel.col}
          fecha={sel.fecha}
          horarioBase={horarioSel}
          eventoExistente={eventoSel}
          onClose={() => setSel(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function HoyCard({
  label,
  value,
  tone,
  names,
}: {
  label: string;
  value: number;
  tone: "accent" | "critical" | "warning" | "info";
  names?: string[];
}) {
  const color = {
    accent: "text-accent",
    critical: "text-critical",
    warning: "text-warning",
    info: "text-info",
  }[tone];
  return (
    <div
      className="rounded-lg border border-border bg-surface px-4 py-3"
      title={names && names.length ? names.join(", ") : undefined}
    >
      <div className="text-xs text-text-muted">{label}</div>
      <div className={`text-3xl font-bold ${value > 0 ? color : "text-text-primary"}`}>
        {value}
      </div>
    </div>
  );
}
