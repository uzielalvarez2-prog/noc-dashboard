// Lógica de la vista de Asistencia (solo ADMIN).
//
// Modelo POR EXCEPCIÓN: cada colaborador tiene un HorarioBase semanal (0=Dom..6=Sab).
// Se asume que trabajó según su horario base salvo que exista un AsistenciaEvento
// ese día. No hay pase de lista diario; el ADMIN solo captura lo que se sale de lo
// normal (falta, retardo, permiso, etc.).
//
// Todas las fechas se manejan al mediodía UTC para que, al formatear en zona
// México (UTC-6), el día no "resbale" al anterior. La cuadrícula trabaja con
// claves "YYYY-MM-DD" para evitar ambigüedades de zona horaria.

import { db } from "@/lib/db";

export const TZ = "America/Mexico_City";

// Tipos de evento — lista fija y corta. El orden define cómo aparecen en el menú.
export const TIPOS_EVENTO = [
  "FALTA",
  "RETARDO",
  "PERMISO",
  "VACACIONES",
  "INCAPACIDAD",
  "AVISO",
  "CAMBIO_DIA",
  "CAMBIO_HORARIO",
  "NOTA",
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const TIPO_LABEL: Record<TipoEvento, string> = {
  FALTA: "Falta",
  RETARDO: "Retardo",
  PERMISO: "Permiso",
  VACACIONES: "Vacaciones",
  INCAPACIDAD: "Incapacidad",
  AVISO: "Avisó que no llega",
  CAMBIO_DIA: "Cambio de día",
  CAMBIO_HORARIO: "Cambio de horario",
  NOTA: "Evento / nota",
};

// Abreviatura de una letra para pintar en la celda de la cuadrícula.
export const TIPO_ABBR: Record<TipoEvento, string> = {
  FALTA: "F",
  RETARDO: "R",
  PERMISO: "P",
  VACACIONES: "V",
  INCAPACIDAD: "I",
  AVISO: "A",
  CAMBIO_DIA: "⇄",
  CAMBIO_HORARIO: "H",
  NOTA: "•",
};

export function esTipoValido(t: string): t is TipoEvento {
  return (TIPOS_EVENTO as readonly string[]).includes(t);
}

/** "YYYY-MM-DD" → Date al mediodía UTC (estable para formateo en México). */
export function parseDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12, 0, 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date → "YYYY-MM-DD" leído como día calendario UTC (pareja de parseDateKey). */
export function toDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** Día de la semana 0=Dom..6=Sab de una clave de fecha. */
export function weekdayOfKey(key: string): number {
  const date = parseDateKey(key);
  return date ? date.getUTCDay() : 0;
}

/** Lista de claves "YYYY-MM-DD" de todos los días de un mes (1-based). */
export function daysInMonth(year: number, month: number): string[] {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const keys: string[] = [];
  for (let d = 1; d <= last; d++) {
    keys.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return keys;
}

export interface ColaboradorConHorario {
  id: string;
  nombre: string;
  usuario: string;
  grupo: string;
  activo: boolean;
  orden: number;
  horarios: { dia: number; horario: string }[];
}

export interface EventoDTO {
  id: string;
  colaboradorId: string;
  fecha: string; // YYYY-MM-DD
  tipo: TipoEvento;
  nota: string;
  fechaRelacionada: string | null; // YYYY-MM-DD
}

/** Horario base de un colaborador para un día de la semana; "" = descanso. */
function horarioDelDia(col: ColaboradorConHorario, weekday: number): string {
  const h = col.horarios.find((x) => x.dia === weekday);
  return h?.horario ?? "";
}

/**
 * ¿El colaborador debía trabajar en esa fecha, considerando cambios de día?
 * Devuelve el horario esperado ("" si descansa). Un CAMBIO_DIA mueve el trabajo
 * del día origen (fecha) al día permutado (fechaRelacionada) y viceversa.
 */
export function horarioEsperado(
  col: ColaboradorConHorario,
  key: string,
  eventosDeCol: EventoDTO[],
): { trabaja: boolean; horario: string } {
  const base = horarioDelDia(col, weekdayOfKey(key));
  let trabaja = base !== "";
  let horario = base;

  for (const ev of eventosDeCol) {
    if (ev.tipo !== "CAMBIO_DIA" || !ev.fechaRelacionada) continue;
    // El evento se guarda en el día que SÍ trabaja; fechaRelacionada es el día
    // que libra a cambio. Si esta fecha es la que trabaja → trabaja aunque el
    // base diga descanso. Si es la que libra → descansa aunque el base trabaje.
    if (ev.fecha === key) {
      trabaja = true;
      if (!horario) horario = horarioDelDia(col, weekdayOfKey(ev.fechaRelacionada));
    } else if (ev.fechaRelacionada === key) {
      trabaja = false;
      horario = "";
    }
  }

  return { trabaja, horario };
}

/** Lee el padrón activo con su horario, ordenado por grupo y orden. */
export async function getColaboradores(): Promise<ColaboradorConHorario[]> {
  const rows = await db.colaborador.findMany({
    where: { activo: true },
    include: { horarios: { select: { dia: true, horario: true } } },
    orderBy: [{ grupo: "asc" }, { orden: "asc" }, { nombre: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    usuario: r.usuario,
    grupo: r.grupo,
    activo: r.activo,
    orden: r.orden,
    horarios: r.horarios,
  }));
}

/** Eventos de un rango de fechas (incluye los cambios de día que caen fuera). */
export async function getEventosMes(year: number, month: number): Promise<EventoDTO[]> {
  // Margen de ±1 mes para que los CAMBIO_DIA con fechaRelacionada vecina entren.
  const desde = new Date(Date.UTC(year, month - 2, 1, 0, 0, 0));
  const hasta = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
  const rows = await db.asistenciaEvento.findMany({
    where: { fecha: { gte: desde, lt: hasta } },
    orderBy: { fecha: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    colaboradorId: r.colaboradorId,
    fecha: toDateKey(r.fecha),
    tipo: (esTipoValido(r.tipo) ? r.tipo : "NOTA") as TipoEvento,
    nota: r.nota,
    fechaRelacionada: r.fechaRelacionada ? toDateKey(r.fechaRelacionada) : null,
  }));
}

export interface ResumenColaborador {
  colaboradorId: string;
  nombre: string;
  grupo: string;
  conteos: Record<TipoEvento, number>;
  diasEsperados: number;
}

/**
 * Resumen por colaborador para un mes: cuántos eventos de cada tipo y cuántos
 * días debía trabajar. Sirve para el panel inferior y la descarga a Excel.
 */
export function construirResumen(
  cols: ColaboradorConHorario[],
  eventos: EventoDTO[],
  year: number,
  month: number,
): ResumenColaborador[] {
  const dias = daysInMonth(year, month);
  const porCol = new Map<string, EventoDTO[]>();
  for (const ev of eventos) {
    const list = porCol.get(ev.colaboradorId) ?? [];
    list.push(ev);
    porCol.set(ev.colaboradorId, list);
  }

  return cols.map((col) => {
    const evCol = porCol.get(col.id) ?? [];
    const conteos = Object.fromEntries(
      TIPOS_EVENTO.map((t) => [t, 0]),
    ) as Record<TipoEvento, number>;
    for (const ev of evCol) {
      if (ev.fecha.startsWith(`${year}-${String(month).padStart(2, "0")}`)) {
        conteos[ev.tipo] = (conteos[ev.tipo] ?? 0) + 1;
      }
    }
    let diasEsperados = 0;
    for (const key of dias) {
      if (horarioEsperado(col, key, evCol).trabaja) diasEsperados++;
    }
    return {
      colaboradorId: col.id,
      nombre: col.nombre,
      grupo: col.grupo,
      conteos,
      diasEsperados,
    };
  });
}

/** Cobertura: cuánta gente debe estar en turno cada día del mes, por grupo. */
export function cobexturaPorDia(
  cols: ColaboradorConHorario[],
  eventos: EventoDTO[],
  year: number,
  month: number,
): Record<string, number> {
  const dias = daysInMonth(year, month);
  const porCol = new Map<string, EventoDTO[]>();
  for (const ev of eventos) {
    const list = porCol.get(ev.colaboradorId) ?? [];
    list.push(ev);
    porCol.set(ev.colaboradorId, list);
  }
  const out: Record<string, number> = {};
  for (const key of dias) {
    let n = 0;
    for (const col of cols) {
      const evCol = porCol.get(col.id) ?? [];
      const esp = horarioEsperado(col, key, evCol);
      // No cuenta si hay falta/vacaciones/permiso/incapacidad ese día.
      const ausente = evCol.some(
        (e) =>
          e.fecha === key &&
          (e.tipo === "FALTA" ||
            e.tipo === "VACACIONES" ||
            e.tipo === "PERMISO" ||
            e.tipo === "INCAPACIDAD"),
      );
      if (esp.trabaja && !ausente) n++;
    }
    out[key] = n;
  }
  return out;
}
