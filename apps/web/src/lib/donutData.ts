import type { DonutDatum } from "@/components/shared/DonutChart";

// Paleta en tonos: azul → cian → verde → ámbar → naranja, un color por porción.
export const DONUT_COLORS = [
  "#3b82f6", // azul
  "#06b6d4", // cian
  "#22c55e", // verde
  "#a3e635", // lima
  "#f59e0b", // ámbar
  "#fb923c", // naranja
  "#f472b6", // rosa
  "#a78bfa", // violeta
  "#38bdf8", // celeste
  "#34d399", // esmeralda
  "#fbbf24", // dorado
  "#fb7185", // coral
  "#818cf8", // índigo
  "#2dd4bf", // teal
  "#facc15", // amarillo
  "#f87171", // rojo claro
];

export const OTROS_COLOR = "#64748b";

// Toma las `topN` mayores y agrupa el resto en una rebanada "Otros", para que la
// dona sea legible sin perder el total. Ordena por conteo (las filas pueden venir
// en otro orden, p. ej. cronológico).
export function toDonutTop(
  rows: { name: string; count: number }[],
  labelFn: (name: string) => string,
  topN = 12
): DonutDatum[] {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, topN);
  const resto = sorted.slice(topN);
  const out: DonutDatum[] = top.map((r, i) => ({
    name: labelFn(r.name),
    value: r.count,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));
  if (resto.length) {
    out.push({
      name: `Otros (${resto.length})`,
      value: resto.reduce((s, r) => s + r.count, 0),
      color: OTROS_COLOR,
    });
  }
  return out;
}
