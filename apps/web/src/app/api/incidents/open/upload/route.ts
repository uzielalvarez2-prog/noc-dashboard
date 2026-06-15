import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
import {
  ACTIVE_GROUPS,
  decodeCsvBuffer,
  isActiveGroup,
  parseCSV,
  parseHpsmDate,
  pickCol,
} from "@/lib/csv/hpsm";

// Carga del CSV de incidentes ABIERTOS.
// El archivo trae todos los grupos; filtramos a PEXA/CECOR, quitamos duplicados
// por (incidente + estado + distrito) y REEMPLAZAMOS el snapshot completo, porque
// los abiertos son una foto del momento (lo que ya no está = se resolvió).
export async function POST(req: NextRequest) {
  const internalKey = process.env.INTERNAL_API_KEY;
  const isInternal = internalKey && req.headers.get("x-internal-key") === internalKey;
  const session = isInternal ? { id: "scraper-bot" } : getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".csv"))
      return NextResponse.json({ error: "Solo se aceptan archivos CSV" }, { status: 400 });

    const text = decodeCsvBuffer(await file.arrayBuffer());
    const rows = parseCSV(text);
    if (rows.length === 0)
      return NextResponse.json({ error: "El CSV está vacío" }, { status: 400 });

    const groupParam = ((formData.get("group") as string) || "").trim().toUpperCase();

    const headers = Object.keys(rows[0]);
    const cId = pickCol(headers, ["Incident ID", "ID"]);
    const cTime = pickCol(headers, ["Open Time", "Opened", "Open"]);
    const cStatus = pickCol(headers, ["Status"]);
    const cCompany = pickCol(headers, ["Company"]);
    const cService = pickCol(headers, ["Service Uniqueid", "Service"]);
    // El scraper exporta "Region" (región Telmex) y "Divisional"; los nombres
    // "Site Name State/District" se aceptan por compatibilidad con CSVs manuales.
    const cState = pickCol(headers, ["Site Name State", "Site State", "Region", "Site Name"]);
    const cAssignee = pickCol(headers, ["Assigned To", "Assignee", "Opened by"]);
    const cDistrict = pickCol(headers, ["Site Name District", "Site District", "Divisional"]);
    const cGroup = pickCol(headers, ["Assignment Group"]);

    if (!cId) {
      return NextResponse.json(
        { error: "El CSV no tiene columna 'Incident ID' ni 'ID'." },
        { status: 400 }
      );
    }
    if (!cGroup && !isActiveGroup(groupParam)) {
      return NextResponse.json(
        { error: "El CSV no tiene 'Assignment Group' y no se pasó el parámetro 'group' (PEXA/CECOR)." },
        { status: 400 }
      );
    }

    const seen = new Set<string>();
    const records: {
      incidentId: string;
      openTime: Date;
      status: string;
      company: string;
      serviceId: string;
      state: string;
      district: string;
      assignee: string | null;
      group: string;
    }[] = [];
    let activeRows = 0;

    for (const row of rows) {
      const group = cGroup ? (row[cGroup] ?? "").trim().toUpperCase() : groupParam;
      if (!isActiveGroup(group)) continue;
      activeRows++;
      const incidentId = (row[cId] ?? "").trim();
      if (!incidentId) continue;
      // Excluir incidentes cerrados que puedan aparecer si la búsqueda no filtró por status
      const rowStatus = cStatus ? (row[cStatus] ?? "").trim().toLowerCase() : "";
      if (rowStatus === "closed") continue;
      const state = cState ? (row[cState] ?? "").trim() : "";
      const district = cDistrict ? (row[cDistrict] ?? "").trim() : "";
      const key = `${incidentId}|${state}|${district}`;
      if (seen.has(key)) continue;
      seen.add(key);

      records.push({
        incidentId,
        openTime: (cTime && parseHpsmDate(row[cTime])) || new Date(),
        status: cStatus ? (row[cStatus] ?? "").trim() : "",
        company: cCompany ? (row[cCompany] ?? "").trim() : "",
        serviceId: cService ? (row[cService] ?? "").trim() : "",
        state,
        district,
        assignee: (cAssignee && (row[cAssignee] ?? "").trim()) || null,
        group,
      });
    }

    if (records.length === 0) {
      return NextResponse.json(
        {
          error: `No se encontraron incidentes de ${ACTIVE_GROUPS.join("/")}. Filas en el CSV: ${rows.length}`,
        },
        { status: 400 }
      );
    }

    // Reemplazo atómico del snapshot. maxWait amplio: el pooler de Neon puede
    // tardar varios segundos en abrir la transacción (P2028 con el default de 2s).
    await db.$transaction(
      async (tx) => {
        await tx.openIncident.deleteMany({});
        await tx.openIncident.createMany({ data: records, skipDuplicates: true });
      },
      { maxWait: 20_000, timeout: 90_000 }
    );

    const uniqueIncidents = new Set(records.map((r) => r.incidentId)).size;

    await db.auditLog
      .create({
        data: {
          userId: session.id,
          action: "IMPORT_OPEN_CSV",
          metadata: {
            filename: file.name,
            totalRows: rows.length,
            inserted: records.length,
            uniqueIncidents,
          },
        },
      })
      .catch(() => {});

    return NextResponse.json({
      ok: true,
      totalRows: rows.length,
      inserted: records.length,
      uniqueIncidents,
      duplicatesRemoved: activeRows - records.length,
      message: `${uniqueIncidents} incidentes abiertos (${records.length} ubicaciones) de PEXA/CECOR importados.`,
    });
  } catch (err) {
    console.error("[POST /api/incidents/open/upload]", err);
    return NextResponse.json({ error: "Error procesando el archivo" }, { status: 500 });
  }
}
