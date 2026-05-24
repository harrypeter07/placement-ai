import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { checkWorkerSecret } from "@/lib/telegram-worker-auth";
import { TelegramWorkerSession } from "@/models/TelegramWorkerSession";
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

    await connectDB();
    const doc = await TelegramWorkerSession.findOne({ key: "default" })
      .select("+sessionString +telethonSessionString phoneNumber telegramUsername displayName connectedAt")
      .lean();

    const gramjs = doc?.sessionString?.trim() || "";
    let telethon = doc?.telethonSessionString?.trim() || "";
    let repaired = false;

    const workerSession = telethonSessionForWorker(telethon, gramjs);
    if (workerSession && workerSession !== telethon) {
      telethon = workerSession;
      repaired = true;
      await TelegramWorkerSession.updateOne(
        { key: "default" },
        { $set: { telethonSessionString: workerSession } }
      );
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
      phoneNumber: doc.phoneNumber,
      telegramUsername: doc.telegramUsername,
      displayName: doc.displayName,
      connectedAt: doc.connectedAt,
      diagnostics: meta,
      workerHint: telethonValid
        ? repaired
          ? "Session auto-converted for Render worker"
          : "Session OK for Render worker"
        : "Run Settings → Sync Render worker session",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
