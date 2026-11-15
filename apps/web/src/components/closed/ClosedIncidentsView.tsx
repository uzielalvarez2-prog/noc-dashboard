"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ClosedStats } from "@/types/closed";
import { ClosedKpis } from "./ClosedKpis";
import { ClosedRankingDonut } from "./ClosedRankingDonut";
import { ClosedDailyTable } from "./ClosedDailyTable";
import { cn } from "@/lib/utils";

type Group = "ALL" | "PEXA" | "CECOR";
// "today" | "all" | "daily" | "YYYY-MM" (un mes concreto del año en curso)
type DateRange = string;

const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Meses disponibles en el selector: de enero al mes en curso del año actual,
// en orden descendente (el más reciente primero).
function availableMonths(): { value: string; label: string }[] {
  const now = new Date();
  const year = now.getFullYear();
  const out: { value: string; label: string }[] = [];
  for (let m = now.getMonth(); m >= 0; m--) {
    out.push({ value: `${year}-${String(m + 1).padStart(2, "0")}`, label: MONTH_LABELS[m] });
  }
  return out;
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

// Rango [primer día 00:00, último día 23:59:59] del mes "YYYY-MM" en hora local.
function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

function isMonthRange(range: DateRange): boolean {
  return /^\d{4}-\d{2}$/.test(range);
}

function isDayRange(range: DateRange): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(range);
}

// Rango UTC [día 00:00, día 23:59:59] de "YYYY-MM-DD". El histórico diario guarda
// el día en UTC, así que el detalle también se pide en UTC para que cuadre.
function dayRangeUtc(ymd: string) {
  return {
    from: `${ymd}T00:00:00.000Z`,
    to: `${ymd}T23:59:59.999Z`,
  };
}

async function fetchStats(group: Group, range: DateRange): Promise<ClosedStats> {
  const params = new URLSearchParams();
  if (group !== "ALL") params.set("group", group);
  if (range === "today") {
    const { from, to } = todayRange();
    params.set("from", from);
    params.set("to", to);
  } else if (isDayRange(range)) {
    // Detalle de un día del histórico: solo cierres de la jornada 07:00–22:00,
    // para que los KPIs y donas cuadren con el total de la tabla "Por día".
    const { from, to } = dayRangeUtc(range);
    params.set("from", from);
    params.set("to", to);
    params.set("jornada", "1");
  } else if (isMonthRange(range)) {
    const { from, to } = monthRange(range);
    params.set("from", from);
    params.set("to", to);
  }
  const qs = params.toString();
  const res = await fetch(`/api/incidents/closed/stats${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Error al obtener estadística");
  return res.json();
}

const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MON = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function labelDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DOW[dt.getUTCDay()]} ${String(d).padStart(2, "0")} ${MON[m - 1]}`;
}

export function ClosedIncidentsView() {
  // Arranca en PEXA (no "Todos"): CECOR irá en su propio apartado más adelante.
  // El selector Todos / PEXA / CECOR sigue disponible para cambiar manualmente.
  const [group, setGroup] = useState<Group>("PEXA");
  const [range, setRange] = useState<DateRange>("today");
  // Modo "Por día": tabla de días + detalle del día elegido. El histórico diario
  // es solo PEXA, así que al entrar se fuerza ese grupo.
  const [dailyMode, setDailyMode] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const dailyGroup = "PEXA";
  // En modo diario, el detalle se pide para el día elegido (jornada 07:00–22:00).
  const detailRange = dailyMode ? (selectedDay ?? "none") : range;
  const detailGroup = dailyMode ? dailyGroup : group;

  const { data: stats } = useQuery<ClosedStats>({
    queryKey: ["closed-stats", detailGroup, detailRange],
    queryFn: () => fetchStats(detailGroup as Group, detailRange),
    enabled: !dailyMode || !!selectedDay,
    refetchInterval: 240_000,
  });

  function enterDaily() {
    setDailyMode(true);
    setGroup("PEXA");
    setSelectedDay(null);
  }
  function exitDaily(nextRange: DateRange) {
    setDailyMode(false);
    setSelectedDay(null);
    setRange(nextRange);
  }

  const groupBtn = (g: Group) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      !dailyMode && group === g
        ? "bg-accent text-white"
        : "border border-border text-text-muted hover:text-text-primary"
    );

  const months = availableMonths();
  const monthActive = !dailyMode && isMonthRange(range);

  // Un botón de rango está activo solo fuera del modo diario.
  const rangeBtn = (r: DateRange) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      !dailyMode && range === r
        ? "bg-surface-elevated text-text-primary"
        : "text-text-muted hover:text-text-primary"
    );

  const dailyBtn = cn(
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    dailyMode ? "bg-surface-elevated text-text-primary" : "text-text-muted hover:text-text-primary"
  );

  // En modo diario el grupo está fijo en PEXA; el selector de grupo se oculta
  // para no sugerir que CECOR/Todos aplican al histórico por día.
  const detailFileSuffix = (dailyMode ? dailyGroup : group).toLowerCase();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Filtro de grupo (oculto en modo diario) */}
        <div className="flex items-center gap-2">
          {!dailyMode &&
            (["ALL", "PEXA", "CECOR"] as Group[]).map((g) => (
              <button key={g} type="button" onClick={() => setGroup(g)} className={groupBtn(g)}>
                {g === "ALL" ? "Todos" : g}
              </button>
            ))}
          {dailyMode && (
            <span className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-muted">
              PEXA
            </span>
          )}
        </div>

        {/* Filtro de fecha */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
          <button type="button" className={rangeBtn("today")} onClick={() => exitDaily("today")}>
            Hoy
          </button>
          <button type="button" className={rangeBtn("all")} onClick={() => exitDaily("all")}>
            Histórico
          </button>
          <button type="button" className={dailyBtn} onClick={enterDaily}>
            Por día
          </button>
          <select
            value={monthActive ? range : ""}
            onChange={(e) => e.target.value && exitDaily(e.target.value)}
            className={cn(
              "rounded-md bg-transparent px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none",
              monthActive
                ? "bg-surface-elevated text-text-primary"
                : "text-text-muted hover:text-text-primary"
            )}
          >
            <option value="" disabled>
              Mes…
            </option>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {dailyMode && (
        <ClosedDailyTable
          group={dailyGroup}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      )}

      {dailyMode && !selectedDay ? (
        <p className="rounded-xl border border-dashed border-border/60 bg-surface/40 px-4 py-6 text-center text-sm text-text-muted">
          Elige un día de la tabla para ver sus analistas, códigos y cumplimiento.
        </p>
      ) : (
        <>
          {dailyMode && selectedDay && (
            <h3 className="text-sm font-semibold text-text-primary">
              Detalle · {labelDay(selectedDay)}{" "}
              <span className="font-normal text-text-muted">(07:00–22:00)</span>
            </h3>
          )}
          <ClosedKpis stats={stats} />

          <div className="grid gap-4 lg:grid-cols-2">
            <ClosedRankingDonut
              title="Analistas"
              dimensionLabel="Analista"
              rows={stats?.byUser ?? []}
              fileBase={`cerrados-analista-${detailFileSuffix}`}
              limit={25}
              showFullTable
            />
            <ClosedRankingDonut
              title="Incidentes cerrados por Código"
              dimensionLabel="Causa"
              rows={stats?.byCause ?? []}
              fileBase={`cerrados-causa-${detailFileSuffix}`}
              limit={12}
            />
          </div>
        </>
      )}
    </div>
  );
}
