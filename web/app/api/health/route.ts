import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import mongoose from "mongoose";

export const runtime = "nodejs";

export async function GET() {
  const checks = {
    web: "online" as const,
    api: "online" as const,
    database: "offline" as "online" | "offline" | "misconfigured",
    timestamp: new Date().toISOString(),
    env: {
      mongodb: !!process.env.MONGODB_URI,
      nextauth: !!process.env.NEXTAUTH_SECRET,
      gemini: !!process.env.GEMINI_API_KEY,
      telegramWorkerSecret: !!process.env.TELEGRAM_WORKER_SECRET,
    },
  };

  if (!process.env.MONGODB_URI) {
    checks.database = "misconfigured";
    return NextResponse.json(checks);
  }

  try {
    await connectDB();
    checks.database = mongoose.connection.readyState === 1 ? "online" : "offline";
  } catch {
    checks.database = "offline";
  }

  return NextResponse.json(checks);
}
