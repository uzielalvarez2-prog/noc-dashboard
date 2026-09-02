// "SISA CECOR": incidentes CECOR cuyo Summary (columna nueva de HPSM) trae un
// folio SISA en texto libre. Todo lo demás del formato EDC es plantilla fija
// que el equipo depura a mano antes de publicar.

/** Primer folio SISA encontrado en el texto de Summary, o null si no aparece. */
export function extractSisaFromSummary(summary: string | null): string | null {
  if (!summary) return null;
  const m = summary.match(/SISA\s*:?\s*(\d+)/i);
  return m ? m[1] : null;
}

/** Fecha "dd/mm/aaaa hh:mm:ss" dentro de Summary, o null si no aparece. */
export function extractInicioFromSummary(summary: string | null): string | null {
  if (!summary) return null;
  const m = summary.match(/\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}(:\d{2})?/);
  return m ? m[0] : null;
}

export interface SisaCecorEdcInput {
  incidentId: string;
  summary: string | null;
}

// Plantilla exacta pedida por el usuario. Campos fijos (Alto impacto, Servicio
// afectado, Estatus, COPE) no cambian por incidente — se depuran a mano.
export function buildEdcTextCecor(it: SisaCecorEdcInput): string {
  const sisa = extractSisaFromSummary(it.summary) ?? "";
  const inicio = extractInicioFromSummary(it.summary);
  return [
    `*Incidente crítico:*  ${it.incidentId}`,
    `Cliente:  CECOR - `,
    `Alto impacto: Sitio crítico, aislado`,
    `Servicio afectado: INF`,
    `Ticket: (${sisa}) | CASE`,
    inicio ? `Inicio: ${inicio}` : `Inicio: `,
    `Estatus: ONT fuera de sincronía`,
    `COPE: `,
  ].join("\n");
}
