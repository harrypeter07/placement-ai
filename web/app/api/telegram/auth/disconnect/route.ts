import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function DELETE() {
  try {
    const user = await requireAuth();
    
    // Delete session and pending auth from Supabase
    await supabase.from("telegram_worker_sessions").delete().eq("key", "default");
    await supabase.from("telegram_auth_pendings").delete().eq("user_id", user.id);
    
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
