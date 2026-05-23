import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireAuth } from "@/lib/api-auth";
import { TelegramWorkerSession } from "@/models/TelegramWorkerSession";
import { createTelegramClient } from "@/lib/telegram-gramjs";
import {
  exportTelethonSessionString,
  isValidTelethonSessionString,
} from "@/lib/telegram-telethon-session";

export const runtime = "nodejs";

/** Re-export Telethon session from existing GramJS login (fixes Render worker without new OTP) */
export async function POST() {
  try {
    await requireAuth();
    await connectDB();
    const doc = await TelegramWorkerSession.findOne({ key: "default" }).select(
      "+sessionString +telethonSessionString"
    );
    if (!doc?.sessionString) {
      return NextResponse.json({ error: "Connect Telegram in Settings first" }, { status: 400 });
    }

    if (isValidTelethonSessionString(doc.telethonSessionString)) {
      return NextResponse.json({
        ok: true,
        alreadySynced: true,
        message: "Render worker session already synced",
        telethonLength: doc.telethonSessionString?.length ?? 0,
      });
    }

    const client = await createTelegramClient(doc.sessionString);
    try {
      if (!(await client.checkAuthorization())) {
        return NextResponse.json(
          { error: "Telegram session expired — disconnect and connect again with phone + OTP" },
          { status: 400 }
        );
      }

      const telethonSessionString = exportTelethonSessionString(client);
      if (!telethonSessionString || !isValidTelethonSessionString(telethonSessionString)) {
        return NextResponse.json(
          {
            error:
              "Could not build Render session from this login. Disconnect Telegram, connect again, then tap Sync immediately.",
            hint: "If this repeats, redeploy Vercel with latest code and try again.",
          },
          { status: 500 }
        );
      }

      await TelegramWorkerSession.updateOne(
        { key: "default" },
        { $set: { telethonSessionString } }
      );

      return NextResponse.json({
        ok: true,
        message: "Render worker session synced — worker should connect within 30 seconds",
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
