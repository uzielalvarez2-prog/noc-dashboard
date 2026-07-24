import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { decodeCsvBuffer, parseCSV, pickCol } from "@/lib/csv/hpsm";
import { cleanVendorTicket, incidentIdFromSisaRow } from "@/lib/sisa";

// Carga del CSV de tickets SISA (export "Vendor Ticket" de HPSM).
// Es un snapshot: cada carga reemplaza el anterior por completo, igual que
// Abiertos. El "Id" del CSV trae "-NNN" al final (sitio/ubicación); el
// incidente real es el prefijo antes del guion.
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

    const headers = Object.keys(rows[0]);
    const cId = pickCol(headers, ["Id", "ID"]);
    const cCompany = pickCol(headers, ["Company"]);
    const cVendor = pickCol(headers, ["Vendor"]);
    const cVendorTicket = pickCol(headers, ["Vendor Ticket"]);

    if (!cId) {
      return NextResponse.json({ error: "El CSV no tiene columna 'Id'." }, { status: 400 });
    }
    if (!cVendorTicket) {
      return NextResponse.json({ error: "El CSV no tiene columna 'Vendor Ticket'." }, { status: 400 });
    }

    const byId = new Map<string, { incidentId: string; company: string; vendor: string; vendorTicket: string }>();
    for (const row of rows) {
      const rawId = (row[cId] ?? "").trim();
      if (!rawId) continue;
      const incidentId = incidentIdFromSisaRow(rawId);
      if (!incidentId) continue;
      byId.set(incidentId, {
        incidentId,
        company: cCompany ? (row[cCompany] ?? "").trim() : "",
        vendor: cVendor ? (row[cVendor] ?? "").trim() : "",
        vendorTicket: cleanVendorTicket(row[cVendorTicket] ?? ""),
      });
    }

    const records = Array.from(byId.values());
    if (records.length === 0) {
      return NextResponse.json({ error: "No se encontraron filas válidas en el CSV" }, { status: 400 });
    }

    // Reemplazo atómico del snapshot, igual criterio que OpenIncident.
    await db.$transaction(
      async (tx) => {
        await tx.sisaTicket.deleteMany({});
        await tx.sisaTicket.createMany({ data: records, skipDuplicates: true });
      },
      { maxWait: 20_000, timeout: 90_000 }
    );

    await db.auditLog
      .create({
        data: {
          userId: session.id,
          action: "IMPORT_SISA_CSV",
          metadata: { filename: file.name, totalRows: rows.length, inserted: records.length },
        },
      })
      .catch(() => {});

    return NextResponse.json({
      ok: true,
      totalRows: rows.length,
      inserted: records.length,
      message: `${records.length} tickets SISA importados.`,
    });
  } catch (err) {
    console.error("[POST /api/sisa/upload]", err);
    return NextResponse.json({ error: "Error procesando el archivo" }, { status: 500 });
  }
}
