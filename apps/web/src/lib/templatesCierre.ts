// Catálogo de templates de cierre de HPSM (capturado del wizard "Select
// Incident Template" el 2026-10-31 con apps/hpsm-scraper/src/explorar-cierre.ts).
//
// Se mantiene aquí como lista fija para poblar el selector de la página de
// cierre. Si HPSM gana/pierde templates, actualizar esta lista (o, a futuro,
// un endpoint que la lea en vivo). El match contra HPSM es por texto EXACTO,
// así que estos strings deben coincidir carácter por carácter con el wizard.
//
// Los más usados para cierre rápido van primeros; el resto en orden de captura.
export const TEMPLATES_CIERRE: string[] = [
  "*A TX SINC",
  "*A CUSTOMER STABLE",
  "*B ONT APAGADA",
  "* A Falso positivo",
  "* C Check",
  "** A SIN ACCESO.",
  "*AA ejecutivo",
  "*AA | Falla de energía",
  "*AA || FALLA DE ENERGÍA",
  "*AA_CORTE DE F.O. POR VANDALISMO.",
  "*C FALLA DE ENERGÍA",
  "LINK DOWN",
  "PROBLEMA COMERCIAL",
  "FALLA EN MEDIO",
  "PRINC ACTIVO",
  "RESP INACTIVO",
  "SE REALIZÓ LA RECONSTRUCCIÓN TOTAL DEL CIRCUITO",
];
