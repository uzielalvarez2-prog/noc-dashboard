import { toPng } from "html-to-image";

/**
 * Captura un elemento del DOM como PNG y lo copia al portapapeles.
 * Si el navegador no soporta ClipboardItem con imágenes (Firefox, Safari
 * viejo), cae a descargar el PNG como archivo.
 */
export async function copyElementAsImage(el: HTMLElement, fileName: string): Promise<"copied" | "downloaded"> {
  const dataUrl = await toPng(el, {
    pixelRatio: 2,
    backgroundColor: getComputedStyle(el).backgroundColor,
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
