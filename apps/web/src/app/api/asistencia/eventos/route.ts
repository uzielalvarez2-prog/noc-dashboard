import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { canAccessAsistencia } from "@/lib/permissions";
import { esTipoValido, parseDateKey } from "@/lib/asistencia";

export const dynamic = "force-dynamic";

function requireAdmin(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (!canAccessAsistencia(session.role)) {
    return { error: NextResponse.json({ error: "Sin permiso" }, { status: 403 }) };
  }
  return { session };
}

// POST /api/asistencia/eventos — crea un evento (una excepción del día).
export async function POST(req: NextRequest) {
  const { session, error } = requireAdmin(req);
  if (error) return error;

  const body = (await req.json().catch(() => null)) as {
    colaboradorId?: unknown;
    fecha?: unknown;
    tipo?: unknown;
    nota?: unknown;
    fechaRelacionada?: unknown;
  } | null;

  const colaboradorId = typeof body?.colaboradorId === "string" ? body.colaboradorId : "";
  const fechaKey = typeof body?.fecha === "string" ? body.fecha : "";
  const tipo = typeof body?.tipo === "string" ? body.tipo : "";
  const nota = typeof body?.nota === "string" ? body.nota.trim() : "";
  const relKey = typeof body?.fechaRelacionada === "string" ? body.fechaRelacionada : "";

  if (!colaboradorId) return NextResponse.json({ error: "Falta el colaborador" }, { status: 400 });
  const fecha = parseDateKey(fechaKey);
  if (!fecha) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  if (!esTipoValido(tipo)) return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });

  let fechaRelacionada: Date | null = null;
  if (tipo === "CAMBIO_DIA") {
    fechaRelacionada = parseDateKey(relKey);
    if (!fechaRelacionada) {
      return NextResponse.json(
        { error: "El cambio de día requiere la fecha que se permuta" },
        { status: 400 },
      );
    }
  }

  const evento = await db.asistenciaEvento.create({
    data: { colaboradorId, fecha, tipo, nota, fechaRelacionada, createdBy: session.id },
  });

  await db.auditLog
    .create({
      data: {
        userId: session.id,
        action: "CREATE_ASISTENCIA_EVENTO",
        targetId: evento.id,
        metadata: { colaboradorId, tipo, fecha: fechaKey },
      },
    })
    .catch(() => {});

  return NextResponse.json({ evento }, { status: 201 });
}

// PATCH /api/asistencia/eventos — edita tipo/nota de un evento existente.
export async function PATCH(req: NextRequest) {
  const { session, error } = requireAdmin(req);
  if (error) return error;

  const body = (await req.json().catch(() => null)) as {
    id?: unknown;
    tipo?: unknown;
    nota?: unknown;
    fechaRelacionada?: unknown;
  } | null;

  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const data: { tipo?: string; nota?: string; fechaRelacionada?: Date | null } = {};
  if (typeof body?.tipo === "string") {
    if (!esTipoValido(body.tipo)) {
      return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
    }
    data.tipo = body.tipo;
  }
  if (typeof body?.nota === "string") data.nota = body.nota.trim();
  if (typeof body?.fechaRelacionada === "string") {
    const rel = parseDateKey(body.fechaRelacionada);
    data.fechaRelacionada = rel; // null si no parsea (limpia el campo)
  }

  const evento = await db.asistenciaEvento.update({ where: { id }, data }).catch(() => null);
  if (!evento) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });

  await db.auditLog
    .create({
      data: { userId: session.id, action: "UPDATE_ASISTENCIA_EVENTO", targetId: id },
    })
    .catch(() => {});

  return NextResponse.json({ evento });
}

// DELETE /api/asistencia/eventos?id=xxx
export async function DELETE(req: NextRequest) {
  const { session, error } = requireAdmin(req);
  if (error) return error;

  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  await db.asistenciaEvento.delete({ where: { id } }).catch(() => {});
  await db.auditLog
    .create({ data: { userId: session.id, action: "DELETE_ASISTENCIA_EVENTO", targetId: id } })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
