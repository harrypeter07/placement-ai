import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { checkWorkerSecret } from "@/lib/telegram-worker-auth";
import { TelegramWorkerSession } from "@/models/TelegramWorkerSession";
import {
  isValidTelethonSessionString,
  sessionsLookIdentical,
} from "@/lib/telegram-telethon-session";

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

    const telethon = doc?.telethonSessionString?.trim();
    const gramjs = doc?.sessionString?.trim();
    const sessionString = telethon || gramjs;

    const telethonValid = isValidTelethonSessionString(telethon);
    const sameAsGramjs = sessionsLookIdentical(telethon, gramjs);
    const meta = {
      hasRecord: !!doc,
      hasGramjsSession: !!gramjs,
      hasTelethonSession: !!telethon,
      telethonValidForWorker: telethonValid && !sameAsGramjs,
      telethonSameAsGramjs: sameAsGramjs,
      gramjsLength: gramjs?.length ?? 0,
      telethonLength: telethon?.length ?? 0,
    };

    if (!doc || !sessionString) {
      console.warn("[telegram/session] worker fetch: 404 no session in DB");
      return NextResponse.json(
        {
          error: "No Telegram session — connect in Settings → Telegram",
          diagnostics: meta,
        },
        { status: 404 }
      );
    }

    console.info(
      `[telegram/session] worker fetch: 200 phone=${doc.phoneNumber} telethonValid=${telethonValid}`
    );

    if (sameAsGramjs) {
      console.warn(
        "[telegram/session] telethonSessionString equals gramjs — invalid for Render worker"
      );
    } else if (!telethonValid && gramjs) {
      console.warn(
        "[telegram/session] GramJS session only — worker needs Sync Render worker session in Settings"
      );
    }

    const workerReady = telethonValid && !sameAsGramjs;

    return NextResponse.json({
      sessionString,
      telethonSessionString: workerReady ? telethon : undefined,
      sessionFormat: workerReady ? "telethon" : gramjs ? "gramjs" : "unknown",
      phoneNumber: doc.phoneNumber,
      telegramUsername: doc.telegramUsername,
      displayName: doc.displayName,
      connectedAt: doc.connectedAt,
      diagnostics: meta,
      workerHint: workerReady
        ? "Session OK for Render worker"
        : sameAsGramjs
          ? "telethon field is GramJS copy — Sync Render worker session again"
          : "Run Settings → Sync Render worker session",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
