// Forma de datos que devuelve el endpoint de estadística de cerrados (lado cliente).

export interface ClosedRankRow {
  name: string;
  count: number;
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
  byCause: ClosedRankRow[];
  byPeriod: ClosedRankRow[];
}
