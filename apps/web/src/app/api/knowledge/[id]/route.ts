import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { canAccessSettings } from "@/lib/permissions";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session || !canAccessSettings(session.role))
    return NextResponse.json({ error: "Solo el administrador puede editar" }, { status: 403 });

  const { id } = await ctx.params;
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

    const doc = await db.knowledgeDoc.update({
      where: { id },
      data: {
        title,
        url,
        category: (body.category ?? "").trim() || "General",
        docType: (body.docType ?? "LINK").trim().toUpperCase(),
        note: (body.note ?? "").trim() || null,
      },
    });
    return NextResponse.json({ doc });
  } catch (err) {
    console.error("[PUT /api/knowledge/:id]", err);
    return NextResponse.json({ error: "Error al actualizar documento" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session || !canAccessSettings(session.role))
    return NextResponse.json({ error: "Solo el administrador puede eliminar" }, { status: 403 });

  const { id } = await ctx.params;
  try {
    await db.knowledgeDoc.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/knowledge/:id]", err);
    return NextResponse.json({ error: "Error al eliminar documento" }, { status: 500 });
  }
}
