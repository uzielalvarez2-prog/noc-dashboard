import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-session";
import { getOperators } from "@/lib/queries/operators";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
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
