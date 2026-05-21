import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { checkWorkerSecret } from "@/lib/telegram-worker-auth";
import { TelegramWorkerSession } from "@/models/TelegramWorkerSession";

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
      .select("+sessionString phoneNumber telegramUsername displayName connectedAt")
      .lean();

    if (!doc?.sessionString) {
      return NextResponse.json(
        { error: "No Telegram session — connect in Settings → Telegram" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      sessionString: doc.sessionString,
      phoneNumber: doc.phoneNumber,
      telegramUsername: doc.telegramUsername,
      displayName: doc.displayName,
      connectedAt: doc.connectedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
