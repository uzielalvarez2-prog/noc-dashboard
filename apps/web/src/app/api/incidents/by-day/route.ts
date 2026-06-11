import { NextResponse } from "next/server";
import { getOpenByDay } from "@/lib/queries/incidents";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getOpenByDay());
  } catch (err) {
    console.error("[GET /api/incidents/by-day]", err);
    return NextResponse.json([], { status: 500 });
  }
}
