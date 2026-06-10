import { NextResponse } from "next/server";
import { getOpenByDay } from "@/lib/queries/incidents";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getOpenByDay();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/incidents/by-day]", err);
    return NextResponse.json([], { status: 500 });
  }
}
