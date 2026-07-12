import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isGeminiConfigured } from "@/lib/ai/gemini-env";

export const runtime = "nodejs";

export async function GET() {
  const checks = {
    web: "online" as const,
    api: "online" as const,
    database: "offline" as "online" | "offline" | "misconfigured",
    timestamp: new Date().toISOString(),
    env: {
      supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      nextauth: !!process.env.NEXTAUTH_SECRET,
      gemini: isGeminiConfigured(),
      telegramWorkerSecret: !!process.env.TELEGRAM_WORKER_SECRET,
    },
  };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    checks.database = "misconfigured";
    return NextResponse.json(checks);
  }

  try {
    const { error } = await supabase.from("users").select("id").limit(1);
    checks.database = !error ? "online" : "offline";
  } catch {
    checks.database = "offline";
  }

  return NextResponse.json(checks);
}
