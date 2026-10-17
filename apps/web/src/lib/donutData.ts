import type { DonutDatum } from "@/components/shared/DonutChart";

// Paleta sobria ("ejecutiva") para gráficas que van a gerencia: tonos apagados,
// sin neón, un color por porción.
export const DONUT_COLORS = [
  "#4a6fa5", // azul acero
  "#5b9aa0", // verde azulado
  "#6a9a6f", // verde salvia
  "#a3b565", // oliva claro
  "#c9a24d", // dorado apagado
  "#c98a5a", // bronce
  "#b5707a", // rosa polvo
  "#8574a8", // violeta apagado
  "#7aa6c2", // azul cielo suave
  "#7db3a0", // verde mar
  "#d1b86a", // arena
  "#b86f5e", // ladrillo
  "#7683b5", // azul pervinca
  "#5fa89f", // turquesa gris
  "#bfae5a", // mostaza
  "#a8706a", // rojo apagado
];

export const OTROS_COLOR = "#7b8794";

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
