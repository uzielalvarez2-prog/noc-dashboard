import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canAccessSettings } from "@/lib/permissions";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Base de Conocimiento: enlaces/PDF/Drive por categoría.
// Lectura: cualquier usuario autenticado. Escritura: Admin/Supervisor.

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const docs = await db.knowledgeDoc.findMany({
      orderBy: [{ category: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ docs });
  } catch (err) {
    console.error("[GET /api/knowledge]", err);
    return NextResponse.json({ error: "Error al cargar documentos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || !canAccessSettings(session.role))
    return NextResponse.json({ error: "Solo el administrador puede subir documentos" }, { status: 403 });

  try {
    const body = (await req.json()) as {
      title?: string;
      url?: string;
      category?: string;
      docType?: string;
      note?: string;
    };
    const title = (body.title ?? "").trim();
    const url = (body.url ?? "").trim();
    if (!title || !url)
      return NextResponse.json({ error: "Título y URL son requeridos" }, { status: 400 });

    const doc = await db.knowledgeDoc.create({
      data: {
        title,
        url,
        category: (body.category ?? "").trim() || "General",
        docType: (body.docType ?? "LINK").trim().toUpperCase(),
        note: (body.note ?? "").trim() || null,
        createdBy: session.id,
      },
    });
    return NextResponse.json({ doc }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/knowledge]", err);
    return NextResponse.json({ error: "Error al crear documento" }, { status: 500 });
  }
}
