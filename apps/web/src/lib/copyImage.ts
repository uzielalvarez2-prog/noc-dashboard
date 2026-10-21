import { toPng } from "html-to-image";

/**
 * Captura un elemento del DOM como PNG y lo copia al portapapeles.
 * Si el navegador no soporta ClipboardItem con imágenes (Firefox, Safari
 * viejo), cae a descargar el PNG como archivo.
 */
export async function copyElementAsImage(
  el: HTMLElement,
  fileName: string,
  opts?: { padding?: number; minWidth?: number }
): Promise<"copied" | "downloaded"> {
  // Si el elemento no tiene fondo propio (transparente), usa el del body para
  // que el PNG no salga con transparencia (en WhatsApp se vería negro/blanco).
  let bg = getComputedStyle(el).backgroundColor;
  if (bg === "transparent" || bg === "rgba(0, 0, 0, 0)") bg = getComputedStyle(document.body).backgroundColor;

  // html-to-image congela el ancho calculado de cada nodo, así que ensanchar el
  // elemento en el clon no reflowea su interior (los textos con `truncate` siguen
  // cortados). Para un elemento angosto se captura una copia fuera de pantalla
  // con el ancho mínimo, donde el layout sí se recalcula.
  let target = el;
  let holder: HTMLElement | null = null;
  if (opts?.minWidth && el.offsetWidth < opts.minWidth) {
    holder = document.createElement("div");
    holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${opts.minWidth}px`;
    target = el.cloneNode(true) as HTMLElement;
    target.style.width = "100%";
    holder.appendChild(target);
    document.body.appendChild(holder);
  }

  let dataUrl: string;
  try {
    // El relleno se agrega al clon con content-box + tamaño original y se amplía
    // el lienzo; con solo `padding` el PNG conserva el tamaño viejo y recorta.
    const pad = opts?.padding ?? 0;
    const w = target.offsetWidth;
    const h = target.offsetHeight;
    dataUrl = await toPng(target, {
      pixelRatio: 2,
      backgroundColor: bg,
      ...(opts && {
        width: w + pad * 2,
        height: h + pad * 2,
        style: { padding: `${pad}px`, boxSizing: "content-box", width: `${w}px`, height: `${h}px` },
      }),
      filter: (node) => !(node instanceof HTMLElement && node.hasAttribute("data-copy-ignore")),
    });
  } finally {
    holder?.remove();
  }
  const blob = await (await fetch(dataUrl)).blob();

  const canUseClipboard =
    typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function";

  if (canUseClipboard) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      return "copied";
    } catch {
      // el usuario pudo haber negado el permiso; cae a descarga
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}
