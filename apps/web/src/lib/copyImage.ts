import { toPng } from "html-to-image";

/**
 * Captura un elemento del DOM como PNG y lo copia al portapapeles.
 * Si el navegador no soporta ClipboardItem con imágenes (Firefox, Safari
 * viejo), cae a descargar el PNG como archivo.
 */
export async function copyElementAsImage(
  el: HTMLElement,
  fileName: string,
  opts?: { padding?: number }
): Promise<"copied" | "downloaded"> {
  // Si el elemento no tiene fondo propio (transparente), usa el del body para
  // que el PNG no salga con transparencia (en WhatsApp se vería negro/blanco).
  let bg = getComputedStyle(el).backgroundColor;
  if (bg === "transparent" || bg === "rgba(0, 0, 0, 0)") bg = getComputedStyle(document.body).backgroundColor;

  // El relleno se agrega al clon con content-box + tamaño original y se amplía
  // el lienzo; con solo `padding` el PNG conserva el tamaño viejo y recorta.
  const pad = opts?.padding ?? 0;
  const w = el.offsetWidth;
  const h = el.offsetHeight;

  const dataUrl = await toPng(el, {
    pixelRatio: 2,
    backgroundColor: bg,
    ...(pad > 0 && {
      width: w + pad * 2,
      height: h + pad * 2,
      style: { padding: `${pad}px`, boxSizing: "content-box", width: `${w}px`, height: `${h}px` },
    }),
    filter: (node) => !(node instanceof HTMLElement && node.hasAttribute("data-copy-ignore")),
  });
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
