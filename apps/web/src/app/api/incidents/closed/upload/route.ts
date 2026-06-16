import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  ACTIVE_GROUPS,
  SLA_MINUTES,
  decodeCsvBuffer,
  isActiveGroup,
  parseCSV,
  parseHpsmDate,
  pickCol,
} from "@/lib/csv/hpsm";

// Carga del CSV de incidentes CERRADOS (por grupo: PEXA o CECOR).
// El cerrado no trae columna de grupo, así que se elige al subir. Con la hora de
// apertura y cierre calculamos el SLA (4 h) aquí mismo. Upsert por incidentId:
// re-subir el archivo del día actualiza en vez de duplicar.
export async function POST(req: NextRequest) {
  const internalKey = process.env.INTERNAL_API_KEY;
  const isInternal = internalKey && req.headers.get("x-internal-key") === internalKey;
  const session = isInternal ? { id: "scraper-bot" } : getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const group = ((formData.get("group") as string) || "").trim().toUpperCase();

    if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".csv"))
      return NextResponse.json({ error: "Solo se aceptan archivos CSV" }, { status: 400 });
    if (!isActiveGroup(group))
      return NextResponse.json(
        { error: `Selecciona el grupo (${ACTIVE_GROUPS.join(" o ")}) al subir cerrados.` },
        { status: 400 }
      );

    const text = decodeCsvBuffer(await file.arrayBuffer());
    const rows = parseCSV(text);
    if (rows.length === 0)
      return NextResponse.json({ error: "El CSV está vacío" }, { status: 400 });

    const headers = Object.keys(rows[0]);
    const cId = pickCol(headers, ["Incident ID"]);
    const cOpen = pickCol(headers, ["Open Time"]);
    const cClose = pickCol(headers, ["Close Time"]);
    const cStatus = pickCol(headers, ["Status"]);
    const cClosedBy = pickCol(headers, ["Closed By"]);
    const cRes = pickCol(headers, ["Res Analyst Code"]);

    if (!cId || !cClose) {
      return NextResponse.json(
        { error: "El CSV no tiene las columnas 'Incident ID' y/o 'Close Time'." },
        { status: 400 }
      );
    }

    const seen = new Set<string>();
    let skipped = 0;
    let cumplidos = 0;
    let vencidos = 0;
    const uploadedAt = new Date();

    const records: {
      incidentId: string;
      group: string;
      openTime: Date;
      closeTime: Date;
      status: string;
      closedBy: string;
      resAnalystCode: string;
      resCause: string;
      resolutionMins: number;
      slaBreached: boolean;
    }[] = [];

    for (const row of rows) {
      const incidentId = (row[cId] ?? "").trim();
      if (!incidentId || seen.has(incidentId)) { skipped++; continue; }
      const closeTime = parseHpsmDate(row[cClose]);
      if (!closeTime) { skipped++; continue; }
      seen.add(incidentId);

      const openTime = cOpen ? parseHpsmDate(row[cOpen]) : null;
      const resAnalystCode = cRes ? (row[cRes] ?? "").trim() : "";
      const resCause = resAnalystCode.split("|")[0].trim() || "SIN CLASIFICAR";
      const resolutionMins = openTime
        ? Math.max(0, Math.round((closeTime.getTime() - openTime.getTime()) / 60000))
        : 0;
      const slaBreached = openTime ? resolutionMins > SLA_MINUTES : false;
      if (openTime) slaBreached ? vencidos++ : cumplidos++;

      records.push({
        incidentId,
        group,
        openTime: openTime ?? closeTime,
        closeTime,
        status: cStatus ? (row[cStatus] ?? "").trim() || "Closed" : "Closed",
        closedBy: cClosedBy ? (row[cClosedBy] ?? "").trim() : "",
        resAnalystCode,
        resCause,
        resolutionMins,
        slaBreached,
      });
    }

    // Un solo INSERT ... ON CONFLICT DO UPDATE para todos los registros.
    // Evita N round-trips a Neon y es resiliente a cold starts.
    if (records.length > 0) {
      await db.$executeRaw`
        INSERT INTO "ClosedIncident"
          ("incidentId","group","openTime","closeTime","status","closedBy",
           "resAnalystCode","resCause","resolutionMins","slaBreached","uploadedAt")
        VALUES ${Prisma.join(
          records.map(
            (r) =>
              Prisma.sql`(${r.incidentId},${r.group},${r.openTime},${r.closeTime},
              ${r.status},${r.closedBy},${r.resAnalystCode},${r.resCause},
              ${r.resolutionMins},${r.slaBreached},${uploadedAt})`
          )
        )}
        ON CONFLICT ("incidentId") DO UPDATE SET
          "group"          = EXCLUDED."group",
          "openTime"       = EXCLUDED."openTime",
          "closeTime"      = EXCLUDED."closeTime",
          "status"         = EXCLUDED."status",
          "closedBy"       = EXCLUDED."closedBy",
          "resAnalystCode" = EXCLUDED."resAnalystCode",
          "resCause"       = EXCLUDED."resCause",
          "resolutionMins" = EXCLUDED."resolutionMins",
          "slaBreached"    = EXCLUDED."slaBreached",
          "uploadedAt"     = EXCLUDED."uploadedAt"
      `;
    }
    const upserted = records.length;

    const evaluables = cumplidos + vencidos;
    const compliance = evaluables > 0 ? Math.round((cumplidos / evaluables) * 1000) / 10 : 0;

    await db.auditLog
      .create({
        data: {
          userId: session.id,
          action: "IMPORT_CLOSED_CSV",
          metadata: { filename: file.name, group, upserted, skipped, cumplidos, vencidos },
        },
      })
      .catch(() => {});

    return NextResponse.json({
      ok: true,
      group,
      upserted,
      skipped,
      cumplidos,
      vencidos,
      compliance,
      message: `${upserted} cerrados de ${group} importados. SLA 4h: ${compliance}% cumplido (${cumplidos} ok / ${vencidos} vencidos).`,
    });
  } catch (err) {
    console.error("[POST /api/incidents/closed/upload]", err);
    return NextResponse.json({ error: "Error procesando el archivo" }, { status: 500 });
  }
}
