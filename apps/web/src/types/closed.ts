// Forma de datos que devuelve el endpoint de estadística de cerrados (lado cliente).

export interface ClosedRankRow {
  name: string;
  count: number;
}

// Un día del histórico diario (cierres por hora de cierre, jornada 07:00–22:00).
export interface ClosedDayPoint {
  day: string; // "YYYY-MM-DD"
  total: number;
  evaluables: number;
  cumplidos: number;
  vencidos: number;
  compliance: number;
  avgResolutionMins: number;
  topUser: string | null;
  topUserCount: number;
}

export interface ClosedStats {
  total: number;
  evaluables: number;
  cumplidos: number;
  vencidos: number;
  compliance: number;
  avgResolutionMins: number;
  medianResolutionMins: number;
  bucket: "day" | "week" | "month";
  byUser: ClosedRankRow[];
  byRequester: ClosedRankRow[];
  byCause: ClosedRankRow[];
  byPeriod: ClosedRankRow[];
}
