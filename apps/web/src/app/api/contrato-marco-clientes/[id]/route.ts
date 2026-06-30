import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as { siglasIm?: string; company?: string; serviceRef?: string; note?: string };
    const siglasIm = (body.siglasIm ?? "").trim();
    const company = (body.company ?? "").trim();
    const serviceRef = (body.serviceRef ?? "").trim();
    if (!siglasIm && !company && !serviceRef)
      return NextResponse.json({ error: "Indica al menos Siglas IM, empresa o servicio" }, { status: 400 });

    const cliente = await db.contratoMarco.update({
      where: { id },
      data: { siglasIm, company, serviceRef, note: (body.note ?? "").trim() || null },
    });
    return NextResponse.json({ cliente });
  } catch (err) {
    console.error("[PUT /api/contrato-marco-clientes/:id]", err);
    return NextResponse.json({ error: "Error al actualizar cliente" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    await db.contratoMarco.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/contrato-marco-clientes/:id]", err);
    return NextResponse.json({ error: "Error al eliminar cliente" }, { status: 500 });
  }
}
