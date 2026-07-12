import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabase } from "@/lib/supabase";
import { downloadMessagePhoto } from "@/lib/telegram-fetch-history";

export const runtime = "nodejs";
export const maxDuration = 30;

/** GET — proxy a photo from Telegram for an authenticated user */
export async function GET(req: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId");
    const messageId = searchParams.get("messageId");
    if (!groupId || !messageId) {
      return NextResponse.json({ error: "groupId and messageId required" }, { status: 400 });
    }

    // Verify message exists in Supabase
    const { data: msg } = await supabase
      .from("telegram_messages")
      .select("id")
      .eq("group_id", groupId)
      .eq("message_id", messageId)
      .maybeSingle();

    if (!msg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Fetch Telegram session
    const { data: sessionDoc } = await supabase
      .from("telegram_worker_sessions")
      .select("session_string")
      .eq("key", "default")
      .maybeSingle();

    if (!sessionDoc?.session_string) {
      return NextResponse.json({ error: "Telegram not connected" }, { status: 400 });
    }

    const buf = await downloadMessagePhoto(sessionDoc.session_string, groupId, messageId);
    if (!buf) {
      return NextResponse.json({ error: "Could not load image" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
