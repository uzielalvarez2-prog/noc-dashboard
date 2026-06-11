import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
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
    let upserted = 0;
    let skipped = 0;
    let cumplidos = 0;
    let vencidos = 0;

    for (const row of rows) {
      const incidentId = (row[cId] ?? "").trim();
      if (!incidentId || seen.has(incidentId)) {
        skipped++;
        continue;
      }
      const closeTime = parseHpsmDate(row[cClose]);
      if (!closeTime) {
        skipped++;
        continue;
      }
      seen.add(incidentId);

      const openTime = cOpen ? parseHpsmDate(row[cOpen]) : null;
      const resAnalystCode = cRes ? (row[cRes] ?? "").trim() : "";
      const resCause = resAnalystCode.split("|")[0].trim() || "SIN CLASIFICAR";
      const resolutionMins = openTime
        ? Math.max(0, Math.round((closeTime.getTime() - openTime.getTime()) / 60000))
        : 0;
      const slaBreached = openTime ? resolutionMins > SLA_MINUTES : false;
      if (openTime) slaBreached ? vencidos++ : cumplidos++;

      const data = {
        group,
        openTime: openTime ?? closeTime,
        closeTime,
        status: cStatus ? (row[cStatus] ?? "").trim() || "Closed" : "Closed",
        closedBy: cClosedBy ? (row[cClosedBy] ?? "").trim() : "",
        resAnalystCode,
        resCause,
        resolutionMins,
        slaBreached,
      };

      await db.closedIncident.upsert({
        where: { incidentId },
        update: { ...data, uploadedAt: new Date() },
        create: { incidentId, ...data },
      });
      upserted++;
    }

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
