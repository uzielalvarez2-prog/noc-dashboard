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
  byUser: ClosedRankRow[];
  byCause: ClosedRankRow[];
}
