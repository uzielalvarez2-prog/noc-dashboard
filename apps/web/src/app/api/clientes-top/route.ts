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
      orderBy: [{ siglasIm: "asc" }, { company: "asc" }, { serviceRef: "asc" }],
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
      siglasIm?: string;
      company?: string;
      serviceRef?: string;
      note?: string;
      bulk?: Array<{ siglasIm?: string; company?: string; serviceRef?: string; note?: string }>;
    };

    // Alta masiva (pegar lista siglas/empresa/servicio).
    if (Array.isArray(body.bulk)) {
      const rows = body.bulk
        .map((r) => ({
          siglasIm: (r.siglasIm ?? "").trim(),
          company: (r.company ?? "").trim(),
          serviceRef: (r.serviceRef ?? "").trim(),
          note: (r.note ?? "").trim() || null,
          createdBy: session.id,
        }))
        .filter((r) => r.siglasIm || r.company || r.serviceRef);

      if (rows.length === 0)
        return NextResponse.json({ error: "No hay filas válidas para importar" }, { status: 400 });

      const result = await db.clienteTop.createMany({ data: rows });
      return NextResponse.json({ ok: true, inserted: result.count }, { status: 201 });
    }

    // Alta individual.
    const siglasIm = (body.siglasIm ?? "").trim();
    const company = (body.company ?? "").trim();
    const serviceRef = (body.serviceRef ?? "").trim();
    if (!siglasIm && !company && !serviceRef)
      return NextResponse.json(
        { error: "Indica al menos Siglas IM, empresa o servicio" },
        { status: 400 }
      );

    // Aviso de duplicado: por Siglas IM si la hay; si no, por empresa+servicio idénticos.
    const dupOr: Array<Record<string, unknown>> = [];
    if (siglasIm)
      dupOr.push({ siglasIm: { equals: siglasIm, mode: "insensitive" } });
    if (company || serviceRef)
      dupOr.push({
        AND: [
          { company: { equals: company, mode: "insensitive" } },
          { serviceRef: { equals: serviceRef, mode: "insensitive" } },
        ],
      });
    if (dupOr.length > 0) {
      const existing = await db.clienteTop.findFirst({ where: { OR: dupOr } });
      if (existing)
        return NextResponse.json(
          {
            error: `Cliente ya existe: ${existing.siglasIm || existing.company || existing.serviceRef}`,
            duplicate: true,
          },
          { status: 409 }
        );
    }

    const cliente = await db.clienteTop.create({
      data: {
        siglasIm,
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
