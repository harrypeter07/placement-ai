import { NextResponse } from "next/server";
import { checkWorkerSecret } from "@/lib/telegram-worker-auth";
import { supabase } from "@/lib/supabase";
import { sessionsLookIdentical, telethonSessionForWorker } from "@/lib/telegram-telethon-session";

export const runtime = "nodejs";

/** GET — worker loads saved StringSession (never expose to browser) */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const apiKey = searchParams.get("apiKey") || req.headers.get("x-worker-secret") || undefined;
    if (!checkWorkerSecret(apiKey ?? undefined)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: doc, error } = await supabase
      .from("telegram_worker_sessions")
      .select("session_string, telethon_session_string, phone_number, telegram_username, display_name, connected_at")
      .eq("key", "default")
      .maybeSingle();

    if (error) {
      console.error("[telegram/session] Supabase error:", error);
    }

    const gramjs = doc?.session_string?.trim() || "";
    let telethon = doc?.telethon_session_string?.trim() || "";
    let repaired = false;

    const workerSession = telethonSessionForWorker(telethon, gramjs);
    if (workerSession && workerSession !== telethon) {
      telethon = workerSession;
      repaired = true;
      
      await supabase
        .from("telegram_worker_sessions")
        .update({ telethon_session_string: workerSession, updated_at: new Date().toISOString() })
        .eq("key", "default");

      console.info("[telegram/session] auto-repaired telethonSessionString for worker");
    }

    const telethonValid = !!workerSession;
    const sameAsGramjs = sessionsLookIdentical(telethon || gramjs, gramjs);
    const meta = {
      hasRecord: !!doc,
      hasGramjsSession: !!gramjs,
      hasTelethonSession: !!telethon,
      telethonValidForWorker: telethonValid,
      telethonSameAsGramjs: sameAsGramjs,
      autoRepaired: repaired,
      gramjsLength: gramjs.length,
      telethonLength: (workerSession || telethon).length,
    };

    if (!doc || !gramjs) {
      return NextResponse.json(
        { error: "No Telegram session — connect in Settings → Telegram", diagnostics: meta },
        { status: 404 }
      );
    }

    return NextResponse.json({
      sessionString: gramjs,
      telethonSessionString: workerSession || undefined,
      gramjsSessionString: gramjs,
      sessionFormat: telethonValid ? "telethon" : "gramjs",
      phoneNumber: doc.phone_number,
      telegramUsername: doc.telegram_username,
      displayName: doc.display_name,
      connectedAt: doc.connected_at,
      diagnostics: meta,
      workerHint: telethonValid
        ? repaired
          ? "Session auto-converted for Railway worker"
          : "Session OK for Railway worker"
        : "Run Settings → Sync Railway worker session",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
