import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabase } from "@/lib/supabase";
import { createTelegramClient } from "@/lib/telegram-gramjs";
import {
  convertGramJsStringToTelethonString,
  exportTelethonSessionString,
  isValidTelethonSessionString,
  telethonSessionForWorker,
} from "@/lib/telegram-telethon-session";

export const runtime = "nodejs";

/** Re-export Telethon session from existing GramJS login (fixes Railway worker without new OTP) */
export async function POST() {
  try {
    await requireAuth();
    
    // Check connected session from Supabase
    const { data: doc } = await supabase
      .from("telegram_worker_sessions")
      .select("session_string, telethon_session_string")
      .eq("key", "default")
      .maybeSingle();

    if (!doc?.session_string) {
      return NextResponse.json({ error: "Connect Telegram in Settings first" }, { status: 400 });
    }

    const existing = doc.telethon_session_string?.trim();
    if (
      existing &&
      isValidTelethonSessionString(existing) &&
      telethonSessionForWorker(existing, doc.session_string)
    ) {
      return NextResponse.json({
        ok: true,
        alreadySynced: true,
        message: "Railway worker session already synced",
        telethonLength: existing.length,
      });
    }

    const client = await createTelegramClient(doc.session_string);
    try {
      if (!(await client.checkAuthorization())) {
        return NextResponse.json(
          { error: "Telegram session expired — disconnect and connect again with phone + OTP" },
          { status: 400 }
        );
      }

      const telethonSessionString =
        exportTelethonSessionString(client) ||
        convertGramJsStringToTelethonString(doc.session_string);
      if (
        !telethonSessionString ||
        !isValidTelethonSessionString(telethonSessionString) ||
        !telethonSessionForWorker(telethonSessionString, doc.session_string)
      ) {
        return NextResponse.json(
          {
            error:
              "Could not build Railway session from this login. Disconnect Telegram, connect again, then tap Sync immediately.",
            hint: "If this repeats, redeploy Vercel with latest code and try again.",
          },
          { status: 500 }
        );
      }

      await supabase
        .from("telegram_worker_sessions")
        .update({ telethon_session_string: telethonSessionString, updated_at: new Date().toISOString() })
        .eq("key", "default");

      return NextResponse.json({
        ok: true,
        message: "Railway worker session synced — worker should connect within 30 seconds",
        telethonLength: telethonSessionString.length,
      });
    } finally {
      await client.disconnect();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
