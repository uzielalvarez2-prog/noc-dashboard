import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOperators } from "@/lib/queries/operators";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const operators = await getOperators();
    return NextResponse.json(operators);
  } catch (err) {
    console.error("[GET /api/operators]", err);
    return NextResponse.json(
      { error: "Error interno al obtener operadores" },
      { status: 500 }
    );
  }
}
