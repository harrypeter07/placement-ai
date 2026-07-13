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
    const user = await requireAuth();
    console.log(`[POST sync-worker-session] Request received from user: ${user.id}`);
    
    // Check connected session from Supabase
    const { data: doc, error: fetchErr } = await supabase
      .from("telegram_worker_sessions")
      .select("session_string, telethon_session_string")
      .eq("key", "default")
      .maybeSingle();

    if (fetchErr) {
      console.error(`[POST sync-worker-session] Supabase fetch error:`, fetchErr);
      return NextResponse.json({ error: "Database query failed" }, { status: 500 });
    }

    if (!doc?.session_string) {
      console.warn(`[POST sync-worker-session] No connected Telegram session found in database.`);
      return NextResponse.json({ error: "Connect Telegram in Settings first" }, { status: 400 });
    }

    const existing = doc.telethon_session_string?.trim();
    if (
      existing &&
      isValidTelethonSessionString(existing) &&
      telethonSessionForWorker(existing, doc.session_string)
    ) {
      console.log(`[POST sync-worker-session] Existing Telethon session is already valid. Skipping regeneration.`);
      return NextResponse.json({
        ok: true,
        alreadySynced: true,
        message: "Railway worker session already synced",
        telethonLength: existing.length,
      });
    }

    console.log(`[POST sync-worker-session] Re-validating GramJS session and exporting Telethon session...`);
    const client = await createTelegramClient(doc.session_string);
    try {
      console.log(`[POST sync-worker-session] Checking client authorization...`);
      if (!(await client.checkAuthorization())) {
        console.warn(`[POST sync-worker-session] GramJS session checkAuthorization returned false (expired/invalid).`);
        return NextResponse.json(
          { error: "Telegram session expired — disconnect and connect again with phone + OTP" },
          { status: 400 }
        );
      }

      console.log(`[POST sync-worker-session] Session is active. Exporting telethon session string...`);
      const telethonSessionString =
        exportTelethonSessionString(client) ||
        convertGramJsStringToTelethonString(doc.session_string);
      
      console.log(`[POST sync-worker-session] Exported string length: ${telethonSessionString?.length || 0}`);

      if (
        !telethonSessionString ||
        !isValidTelethonSessionString(telethonSessionString) ||
        !telethonSessionForWorker(telethonSessionString, doc.session_string)
      ) {
        console.error(`[POST sync-worker-session] Generated telethon session string failed validation!`);
        return NextResponse.json(
          {
            error:
              "Could not build Railway session from this login. Disconnect Telegram, connect again, then tap Sync immediately.",
            hint: "If this repeats, redeploy Vercel with latest code and try again.",
          },
          { status: 500 }
        );
      }

      console.log(`[POST sync-worker-session] Updating telethon_session_string in telegram_worker_sessions table...`);
      const { error: updateErr } = await supabase
        .from("telegram_worker_sessions")
        .update({ telethon_session_string: telethonSessionString, updated_at: new Date().toISOString() })
        .eq("key", "default");

      if (updateErr) {
        console.error(`[POST sync-worker-session] Supabase update failed:`, updateErr);
        throw new Error("Failed to save synced Telethon session to database");
      }
      console.log(`[POST sync-worker-session] Synced session updated successfully.`);

      return NextResponse.json({
        ok: true,
        message: "Railway worker session synced — worker should connect within 30 seconds",
        telethonLength: telethonSessionString.length,
      });
    } finally {
      console.log(`[POST sync-worker-session] Disconnecting client...`);
      await client.disconnect();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error(`[POST sync-worker-session] Exception caught:`, e);
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
