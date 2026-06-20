// Paleta para exportar gráficas a imagen (canvas) según el tema activo.
// Refleja los tokens de globals.css para dark y light, de modo que la imagen
// copiada se vea igual que el dashboard del usuario en ese momento.

export interface CanvasPalette {
  bg: string; // fondo
  title: string; // texto fuerte (títulos / totales)
  text: string; // texto normal (valores, etiquetas de fila)
  muted: string; // ejes, leyendas, etiquetas secundarias
  grid: string; // líneas de cuadrícula / base
  trackBg: string; // fondo de la barra (riel)
}

export function canvasPalette(theme: "dark" | "light"): CanvasPalette {
  if (theme === "light") {
    return {
      bg: "#ffffff",
      title: "#0f172a",
      text: "#1e293b",
      muted: "#64748b",
      grid: "#e2e8f0",
      trackBg: "#eef2f6",
    };
  }
  return {
    bg: "#0d1526",
    title: "#f8fafc",
    text: "#e2e8f0",
    muted: "#64748b",
    grid: "#1e3048",
    trackBg: "#1e293b",
  };
}
