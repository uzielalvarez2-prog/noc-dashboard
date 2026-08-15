import { db } from "@/lib/db";

/**
 * Logins que HPSM reporta bajo Assignment Group PEXA/CECOR pero que en
 * realidad son cuentas de bot, no operadores humanos. Se muestran aparte
 * en el área "Bot" sin importar qué grupo traiga el incidente.
 */
const BOT_LOGINS = ["smBotCARE"];

function isBotLogin(login: string): boolean {
  return BOT_LOGINS.some((b) => b.toLowerCase() === login.toLowerCase());
}

/**
 * Vista EN VIVO: operadores (logins HPSM, p.ej. kvieyra) con incidentes
 * abiertos asignados en el snapshot actual. Sin históricos de cerrados —
 * refleja quién está gestionando qué en este momento.
 */
export async function getOperators() {
  const rows = await db.openIncident.findMany({
    where: { assignee: { not: null } },
    select: { assignee: true, incidentId: true, group: true, status: true },
  });

  interface Acc {
    incidents: Set<string>;
    groups: Set<string>;
    statuses: Map<string, Set<string>>;
  }
  const map = new Map<string, Acc>();
  for (const r of rows) {
    if (!r.assignee) continue;
    let e = map.get(r.assignee);
    if (!e)
      map.set(
        r.assignee,
        (e = { incidents: new Set(), groups: new Set(), statuses: new Map() })
      );
    e.incidents.add(r.incidentId);
    e.groups.add(isBotLogin(r.assignee) ? "Bot" : r.group);
    const st = (r.status || "SIN ESTATUS").toUpperCase();
    let s = e.statuses.get(st);
    if (!s) e.statuses.set(st, (s = new Set()));
    s.add(r.incidentId);
  }

  return [...map.entries()]
    .map(([login, e]) => ({
      login,
      openCount: e.incidents.size,
      groups: [...e.groups].sort(),
      statuses: [...e.statuses.entries()]
        .map(([status, ids]) => ({ status, count: ids.size }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.openCount - a.openCount || a.login.localeCompare(b.login));
}

export type OperatorStats = Awaited<ReturnType<typeof getOperators>>[number];
