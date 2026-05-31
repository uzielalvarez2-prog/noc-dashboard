import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";

// Parsea fecha formato HPSM: "YY/MM/DD HH:MM:SS"
function parseHpsmDate(s: string): Date {
  if (!s?.trim()) return new Date();
  // Formato ISO
  if (s.includes("T") || s.includes("-")) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  // Formato CSV: "26/05/27 10:07:33"
  const [datePart = "", timePart = "00:00:00"] = s.trim().split(" ");
  const [yy = "0", mm = "1", dd = "1"] = datePart.split("/");
  const [hh = "0", min = "0", sec = "0"] = timePart.split(":");
  return new Date(
    2000 + parseInt(yy),
    parseInt(mm) - 1,
    parseInt(dd),
    parseInt(hh),
    parseInt(min),
    parseInt(sec)
  );
}

// Mapea status del CSV al enum interno
function mapStatus(s: string): "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" {
  const v = s.toLowerCase().replace(/\s+/g, "_");
  if (v === "open") return "OPEN";
  if (v.includes("progress") || v.includes("work") || v.includes("pending")) return "IN_PROGRESS";
  if (v === "resolved") return "RESOLVED";
  if (v === "closed") return "CLOSED";
  return "OPEN";
}

// Parseador CSV robusto (maneja comillas y comas dentro de campos)
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = headerLine.split(",").map((h) => h.replace(/^"|"$/g, "").trim());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const assignmentGroup = (formData.get("group") as string) || "PEXA";

    if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
    if (!file.name.endsWith(".csv")) return NextResponse.json({ error: "Solo se aceptan archivos CSV" }, { status: 400 });

    const text = await file.text();
    const rows = parseCSV(text);

    // Detectar columnas (el CSV de HPSM puede tener variaciones)
    const sample = rows[0] ?? {};
    const colId = Object.keys(sample).find((k) => k.toLowerCase().includes("incident") && k.toLowerCase().includes("id")) ?? "Incident ID";
    const colTime = Object.keys(sample).find((k) => k.toLowerCase().includes("open") && k.toLowerCase().includes("time")) ?? "Open Time";
    const colStatus = Object.keys(sample).find((k) => k.toLowerCase() === "status") ?? "Status";
    const colGroup = Object.keys(sample).find((k) => k.toLowerCase().includes("assignment") && k.toLowerCase().includes("group")) ?? "Assignment Group";
    const colAssignee = Object.keys(sample).find((k) => k.toLowerCase() === "assignee") ?? "Assignee";

    // Deduplicar por Incident ID y filtrar por grupo
    const seen = new Set<string>();
    const filtered = rows.filter((row) => {
      const id = row[colId]?.trim();
      const group = row[colGroup]?.trim();
      if (!id || seen.has(id)) return false;
      if (assignmentGroup && group !== assignmentGroup) return false;
      seen.add(id);
      return true;
    });

    if (filtered.length === 0) {
      return NextResponse.json({
        error: `No se encontraron incidentes para el grupo "${assignmentGroup}". Total en CSV: ${rows.length}`,
      }, { status: 400 });
    }

    // Fecha de referencia para calcular SLA (usando fecha actual)
    const now = new Date();
    let upserted = 0;
    let errors = 0;

    const BATCH = 50;
    for (let i = 0; i < filtered.length; i += BATCH) {
      const batch = filtered.slice(i, i + BATCH);
      await Promise.allSettled(
        batch.map(async (row) => {
          try {
            const id = row[colId].trim();
            const openTime = parseHpsmDate(row[colTime]);
            const status = mapStatus(row[colStatus] ?? "");

            // SLA deadline: 8 horas desde apertura (ajustar según tu SLA real)
            const slaDeadline = new Date(openTime.getTime() + 8 * 3600000);
            const slaBreached = slaDeadline < now && !["RESOLVED", "CLOSED"].includes(status);

            await db.incident.upsert({
              where: { id },
              update: {
                status,
                assignedTo: row[colAssignee]?.trim() || null,
                slaBreached,
                updatedAt: now,
                syncedAt: now,
                rawData: row as Record<string, string>,
              },
              create: {
                id,
                title: `${id} — ${row[colGroup] ?? assignmentGroup}`,
                severity: "MEDIUM",
                status,
                assignedTo: row[colAssignee]?.trim() || null,
                slaDeadline,
                slaBreached,
                slaRiskAt: new Date(slaDeadline.getTime() - 2 * 3600000),
                source: "HPSM-CSV",
                rawData: row as Record<string, string>,
                createdAt: openTime,
                updatedAt: now,
                syncedAt: now,
              },
            });
            upserted++;
          } catch {
            errors++;
          }
        })
      );
    }

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.id,
        action: "IMPORT_CSV",
        metadata: { filename: file.name, total: filtered.length, upserted, errors, group: assignmentGroup },
      },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      total: rows.length,
      filtered: filtered.length,
      upserted,
      errors,
      message: `${upserted} incidentes de ${assignmentGroup} importados correctamente`,
    });
  } catch (err) {
    console.error("[POST /api/incidents/upload]", err);
    return NextResponse.json({ error: "Error procesando el archivo" }, { status: 500 });
  }
}
