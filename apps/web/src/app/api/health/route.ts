import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    time: new Date().toISOString(),
    env: {
      hasDbUrl: !!process.env.DATABASE_URL,
      dbUrlStart: process.env.DATABASE_URL?.slice(0, 30),
      hasAuthSecret: !!process.env.AUTH_SECRET,
      hasAuthUrl: !!process.env.AUTH_URL,
      hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
      nodeEnv: process.env.NODE_ENV,
    },
  });
}
