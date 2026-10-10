import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { isResolvedStatus } from "@/lib/war-room";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// GET — conteo de incidentes ABIERTOS AHORA por Cliente TOP, para las tarjetas
// del tablero. Lee de OpenIncident (el snapshot que el scraper reemplaza por
// completo cada 5 min) y NO de WarRoomIncident: esa tabla persiste 7 días de
// historial y "resolvedAt IS NULL" ahí no equivale a "sigue abierto hoy" (un
// incidente que salió del snapshot sin pasar por RESOLVED se queda ahí para
// siempre). Mismo criterio de match que syncWarRoom (company / serviceRef /
// siglasIm por prefijo del incidentId), reimplementado como lectura en memoria.
// ─────────────────────────────────────────────────────────────────────────────

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function incidentPrefix(incidentId: string): string {
  return norm(incidentId.replace(/\d+$/, ""));
}

// Mismo umbral que el resto del dashboard: activo con más de 4h sin resolver.
const CRITICAL_AGE_MS = 4 * 3_600_000;

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const [clientes, rows] = await Promise.all([
      db.clienteTop.findMany({ orderBy: [{ company: "asc" }] }),
      db.openIncident.findMany({
        select: { incidentId: true, openTime: true, status: true, company: true, serviceId: true },
      }),
    ]);

    // 1 fila por incidente (un IM puede abarcar varios sitios en OpenIncident).
    const byIncident = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!byIncident.has(r.incidentId)) byIncident.set(r.incidentId, r);
    const abiertos = [...byIncident.values()];

    const now = Date.now();
    const stats = clientes.map((c) => {
      const co = norm(c.company);
      const sv = norm(c.serviceRef);
      const si = norm(c.siglasIm);

      const matches = abiertos.filter((inc) => {
        const incCo = norm(inc.company);
        const incSv = norm(inc.serviceId);
        const prefix = incidentPrefix(inc.incidentId);
        const companyMatch = co.length > 0 && incCo === co;
        const serviceMatch = sv.length > 0 && incSv === sv;
        const siglasMatch = si.length > 0 && (prefix === si || incCo === si);
        return companyMatch || serviceMatch || siglasMatch;
      });

      // Edad (ms) de cada incidente que ya superó el SLA de 4h, sin resolver —
      // el frontend los agrupa por dilación exacta ("1 con dilación de 1d 4h").
      const delayedMs = matches
        .filter((inc) => !isResolvedStatus(inc.status) && now - inc.openTime.getTime() > CRITICAL_AGE_MS)
        .map((inc) => now - inc.openTime.getTime());

      return {
        id: c.id,
        company: c.company,
        displayName: c.note?.trim() || c.company,
        siglasIm: c.siglasIm,
        serviceRef: c.serviceRef,
        note: c.note,
        openCount: matches.length,
        criticalCount: delayedMs.length,
        delayedMs,
      };
    });

    return NextResponse.json({ clientes: stats });
  } catch (err) {
    console.error("[GET /api/clientes-top/stats]", err);
    return NextResponse.json({ error: "Error al cargar estadísticas" }, { status: 500 });
  }
}
