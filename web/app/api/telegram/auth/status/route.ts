import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

function maskPhone(phone: string) {
  if (phone.length < 6) return "***";
  return `${phone.slice(0, 3)}***${phone.slice(-2)}`;
}

export async function GET() {
  try {
    await requireAuth();
    
    // Check connected session from Supabase
    const { data: doc } = await supabase
      .from("telegram_worker_sessions")
      .select("session_string, phone_number, telegram_username, display_name, connected_at")
      .eq("key", "default")
      .maybeSingle();

    if (!doc?.session_string) {
      return NextResponse.json({
        connected: false,
        apiConfigured: !!(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH),
      });
    }

    return NextResponse.json({
      connected: true,
      apiConfigured: true,
      phoneNumber: maskPhone(doc.phone_number || ""),
      telegramUsername: doc.telegram_username,
      displayName: doc.display_name,
      connectedAt: doc.connected_at,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
