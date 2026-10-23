// Tipos compartidos del cliente de Asistencia (igual que los DTO de la API).

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

// Clase de color de la celda según el tipo (usa tokens del design system).
export const TIPO_CLASE: Record<TipoEvento, string> = {
  FALTA: "bg-critical-dim text-critical border border-critical/50",
  RETARDO: "bg-warning-dim text-warning border border-warning/50",
  PERMISO: "bg-info/10 text-info border border-info/40",
  VACACIONES: "bg-success-dim text-success border border-success/50",
  INCAPACIDAD: "bg-warning-dim text-warning border border-warning/40",
  AVISO: "bg-accent/10 text-accent border border-accent/40",
  CAMBIO_DIA: "bg-surface-elevated text-text-primary border border-border",
  CAMBIO_HORARIO: "bg-surface-elevated text-text-primary border border-border",
  NOTA: "bg-surface-elevated text-text-muted border border-border",
};

export interface HorarioDia {
  dia: number;
  horario: string;
}

export interface Colaborador {
  id: string;
  nombre: string;
  usuario: string;
  grupo: string;
  activo: boolean;
  orden: number;
  horarios: HorarioDia[];
}

export interface Evento {
  id: string;
  colaboradorId: string;
  fecha: string; // YYYY-MM-DD
  tipo: TipoEvento;
  nota: string;
  fechaRelacionada: string | null;
}

export interface Resumen {
  colaboradorId: string;
  nombre: string;
  grupo: string;
  conteos: Record<TipoEvento, number>;
  diasEsperados: number;
}

export interface AsistenciaData {
  year: number;
  month: number;
  colaboradores: Colaborador[];
  eventos: Evento[];
  resumen: Resumen[];
  cobertura: Record<string, number>;
}

export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const DIAS_SEMANA = ["D", "L", "M", "M", "J", "V", "S"];

/** Mismo criterio que el servidor: ¿debía trabajar ese día (con cambios de día)? */
export function horarioEsperado(
  col: Colaborador,
  key: string,
  eventosDeCol: Evento[],
): { trabaja: boolean; horario: string } {
  const weekday = weekdayOfKey(key);
  const base = col.horarios.find((h) => h.dia === weekday)?.horario ?? "";
  let trabaja = base !== "";
  let horario = base;

  for (const ev of eventosDeCol) {
    if (ev.tipo !== "CAMBIO_DIA" || !ev.fechaRelacionada) continue;
    if (ev.fecha === key) {
      trabaja = true;
      if (!horario) {
        const wr = weekdayOfKey(ev.fechaRelacionada);
        horario = col.horarios.find((h) => h.dia === wr)?.horario ?? "";
      }
    } else if (ev.fechaRelacionada === key) {
      trabaja = false;
      horario = "";
    }
  }
  return { trabaja, horario };
}

export function weekdayOfKey(key: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return 0;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)).getUTCDay();
}

export function daysInMonth(year: number, month: number): string[] {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const keys: string[] = [];
  for (let d = 1; d <= last; d++) {
    keys.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return keys;
}

/** Clave "YYYY-MM-DD" de hoy en zona México. */
export function hoyKey(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}
