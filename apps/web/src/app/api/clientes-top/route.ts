import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Clientes TOP: base editable empresa/servicio que dispara War Room.
// Visible y editable por cualquier usuario autenticado (decisión del equipo NOC).

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const clientes = await db.clienteTop.findMany({
      orderBy: [{ company: "asc" }, { serviceRef: "asc" }],
    });
    return NextResponse.json({ clientes });
  } catch (err) {
    console.error("[GET /api/clientes-top]", err);
    return NextResponse.json({ error: "Error al cargar clientes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = (await req.json()) as {
      company?: string;
      serviceRef?: string;
      note?: string;
      bulk?: Array<{ company?: string; serviceRef?: string; note?: string }>;
    };

    // Alta masiva (pegar lista empresa/servicio).
    if (Array.isArray(body.bulk)) {
      const rows = body.bulk
        .map((r) => ({
          company: (r.company ?? "").trim(),
          serviceRef: (r.serviceRef ?? "").trim(),
          note: (r.note ?? "").trim() || null,
          createdBy: session.id,
        }))
        .filter((r) => r.company || r.serviceRef);

      if (rows.length === 0)
        return NextResponse.json({ error: "No hay filas válidas para importar" }, { status: 400 });

      const result = await db.clienteTop.createMany({ data: rows });
      return NextResponse.json({ ok: true, inserted: result.count }, { status: 201 });
    }

    // Alta individual.
    const company = (body.company ?? "").trim();
    const serviceRef = (body.serviceRef ?? "").trim();
    if (!company && !serviceRef)
      return NextResponse.json(
        { error: "Indica al menos empresa o servicio" },
        { status: 400 }
      );

    const cliente = await db.clienteTop.create({
      data: {
        company,
        serviceRef,
        note: (body.note ?? "").trim() || null,
        createdBy: session.id,
      },
    });
    return NextResponse.json({ cliente }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/clientes-top]", err);
    return NextResponse.json({ error: "Error al crear cliente" }, { status: 500 });
  }
}
